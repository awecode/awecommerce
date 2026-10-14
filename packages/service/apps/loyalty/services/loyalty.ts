import { ValidationError } from '../../../core/errors'
import { and, asc, desc, eq, gt, isNull, lt, or } from 'drizzle-orm'
import {
  InsertLoyaltyLogs,
  loyaltyLogs,
  LoyaltyPoints,
  loyaltyPoints,
  loyaltySettings,
  UpdateLoyaltySettings,
} from '../schemas'
import { Database } from '../../types'
import { Decimal } from 'decimal.js'

// Loyalty settings are a single row with this id
const SETTINGS_ID = 1

class LoyaltyService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async getSettings() {
    const findSetting = () =>
      this.db.query.loyaltySettings.findFirst({
        columns: {
          id: false,
        },
        where: eq(loyaltySettings.id, SETTINGS_ID),
      })
    const setting = await findSetting()
    if (setting) {
      return setting
    }
    await this.db
      .insert(loyaltySettings)
      .values({ id: SETTINGS_ID })
      .onConflictDoNothing()
    return (await findSetting())!
  }

  async updateSettings(data: UpdateLoyaltySettings) {
    if (!Object.keys(data).length) {
      return
    }
    await this.db
      .insert(loyaltySettings)
      .values({ ...data, id: SETTINGS_ID })
      .onConflictDoUpdate({
        target: loyaltySettings.id,
        set: data,
      })
  }

  async addLoyaltyPoint(userId: string, orderId: number, price: number, roundOff = false) {
    return await this.db.transaction(async (tx) => {
      const loyaltyService = new LoyaltyService(tx)
      const settings = await loyaltyService.getSettings()
      if (!settings.isEnabled || !settings.earnRate) {
        return
      }
      let earnedPoints = price * Number(settings.earnRate)
      if(roundOff) {
        earnedPoints = Math.round(earnedPoints)
      }
      await tx.insert(loyaltyPoints).values({
        userId,
        orderId,
        earnedPoints: earnedPoints.toString(),
      })
      await loyaltyService.createLog({
        userId,
        orderId,
        points: earnedPoints.toString(),
        type: 'earned',
      })
      return earnedPoints
    })
  }

  async createLog(data: InsertLoyaltyLogs) {
    return await this.db.insert(loyaltyLogs).values(data).returning()
  }

  async getTotalRedeemablePoints(userId: string) {
    const points = await this.db.query.loyaltyPoints.findMany({
      where: and(
        eq(loyaltyPoints.userId, userId),
        or(
          isNull(loyaltyPoints.expiresAt),
          gt(loyaltyPoints.expiresAt, new Date()),
        ),
        lt(loyaltyPoints.redeemedPoints, loyaltyPoints.earnedPoints),
      ),
    })
    return points.reduce<Decimal>(
      (acc: Decimal, point: LoyaltyPoints) =>
        acc.add(new Decimal(point.earnedPoints)).sub(new Decimal(point.redeemedPoints!)),
      new Decimal(0),
    ).toNumber()
  }

  async getTotalRedeemablePointsAndValue(userId: string) {
    const settings = await this.getSettings()
    const totalRedeemablePoints = await this.getTotalRedeemablePoints(userId)
    return {
      totalRedeemablePoints,
      totalRedeemableValue: settings.redeemRate
        ? totalRedeemablePoints * Number(settings.redeemRate)
        : 0,
    }
  }

  async getUserLoyaltyPoints(userId: string) {
    const availablePoints = await this.db.query.loyaltyPoints.findMany({
      where: eq(loyaltyPoints.userId, userId),
      orderBy: desc(loyaltyPoints.createdAt),
    })

    const settings = await this.getSettings()

    const points = availablePoints.map((point) => ({
      ...point,
      pointsWorth: settings.redeemRate
        ? Number(point.earnedPoints) * Number(settings.redeemRate)
        : 0,
      status:
        point.expiresAt && point.expiresAt < new Date()
          ? 'expired'
          : Number(point.redeemedPoints) < Number(point.earnedPoints)
          ? 'usable'
          : 'redeemed',
    })) as Array<
      LoyaltyPoints & {
        pointsWorth: number
        status: 'usable' | 'redeemed' | 'expired'
      }
    >

    const usablePoints = points.filter(
      (point: { status: 'usable' | 'redeemed' | 'expired' }) =>
        point.status === 'usable',
    )

    const totalRedeemablePoints = usablePoints.reduce(
      (acc: Decimal, point: LoyaltyPoints) =>
        acc.add(new Decimal(point.earnedPoints)).sub(new Decimal(point.redeemedPoints!)),
      new Decimal(0),
    )

    return {
      points,
      totalRedeemablePoints: totalRedeemablePoints.toNumber(),
      totalRedeemableValue: settings.redeemRate
        ? totalRedeemablePoints.mul(new Decimal(settings.redeemRate)).toNumber()
        : 0,
    }
  }

  // Locks the user's point rows so concurrent redeems and refunds for the
  // same user run one at a time. Must be called inside a transaction.
  private async lockUserPoints(userId: string) {
    await this.db
      .select({ id: loyaltyPoints.id })
      .from(loyaltyPoints)
      .where(eq(loyaltyPoints.userId, userId))
      .orderBy(asc(loyaltyPoints.id))
      .for('update')
  }

  async redeemPoints(userId: string, orderId: number, points: number) {
    return await this.db.transaction(async (tx) => {
      const loyaltyService = new LoyaltyService(tx)
      if (!(points > 0)) {
        throw new ValidationError('Points must be greater than zero')
      }
      await loyaltyService.lockUserPoints(userId)
      const pointsToRedeem = points
      let pointsToDeduct = pointsToRedeem
      const pointsData = await tx.query.loyaltyPoints.findMany({
        where: and(
          eq(loyaltyPoints.userId, userId),
          or(
            isNull(loyaltyPoints.expiresAt),
            gt(loyaltyPoints.expiresAt, new Date()),
          ),
          lt(loyaltyPoints.redeemedPoints, loyaltyPoints.earnedPoints),
        ),
        orderBy: asc(loyaltyPoints.createdAt),
      })
      const availablePoints = pointsData.reduce(
        (acc, point) =>
          acc.add(new Decimal(point.earnedPoints)).sub(new Decimal(point.redeemedPoints)),
        new Decimal(0),
      )
      if (availablePoints.lt(pointsToRedeem)) {
        throw new ValidationError('Insufficient loyalty points')
      }
      for (const point of pointsData) {
        if (pointsToDeduct <= 0) {
          break
        }
        const redeemablePoints =
          Number(point.earnedPoints) - Number(point.redeemedPoints)
        const pointsToRedeemFromThis = Math.min(pointsToDeduct, redeemablePoints)
        await tx
          .update(loyaltyPoints)
          .set({
            redeemedPoints: new Decimal(point.redeemedPoints).add(new Decimal(`${pointsToRedeemFromThis}`)).toString(),
          })
          .where(eq(loyaltyPoints.id, point.id))
        pointsToDeduct -= pointsToRedeemFromThis
      }
      await loyaltyService.createLog({
        userId,
        orderId,
        points: pointsToRedeem.toString(),
        type: 'redeemed',
      })
      return pointsToRedeem
    })
  }

  // Points still redeemed for an order: redeemed minus already given back
  private async redeemedPointsForOrder(userId: string, orderId: number) {
    const orderLogs = await this.db.query.loyaltyLogs.findMany({
      where: and(
        eq(loyaltyLogs.userId, userId),
        eq(loyaltyLogs.orderId, orderId),
      ),
    })
    return orderLogs.reduce((acc, log) => {
      if (log.type === 'redeemed') return acc.add(new Decimal(log.points))
      if (log.type === 'unredeemed') return acc.sub(new Decimal(log.points))
      return acc
    }, new Decimal(0))
  }

  // Checks that a user can redeem the points now and returns their value
  async redemptionValue(userId: string | null, points: number) {
    if (!userId) {
      throw new ValidationError('Guests cannot redeem loyalty points')
    }
    if (!(points > 0)) {
      throw new ValidationError('Points must be greater than zero')
    }
    const settings = await this.getSettings()
    if (!settings.isEnabled || !settings.redeemRate) {
      throw new ValidationError('Loyalty points cannot be redeemed')
    }
    if (new Decimal(await this.getTotalRedeemablePoints(userId)).lt(points)) {
      throw new ValidationError('Insufficient loyalty points')
    }
    return new Decimal(points).mul(settings.redeemRate)
  }

  // Gives back the points still redeemed for an order, if any
  async unredeemOrderPoints(userId: string, orderId: number) {
    return await this.db.transaction(async (tx) => {
      const loyaltyService = new LoyaltyService(tx)
      await loyaltyService.lockUserPoints(userId)
      const points = await loyaltyService.redeemedPointsForOrder(userId, orderId)
      if (points.gt(0)) {
        await loyaltyService.unredeemPoints(userId, orderId, points.toNumber())
      }
    })
  }

  async unredeemPoints(userId: string, orderId: number, points: number) {
    return await this.db.transaction(async (tx) => {
      const loyaltyService = new LoyaltyService(tx)
      if (!(points > 0)) {
        throw new ValidationError('Points must be greater than zero')
      }
      await loyaltyService.lockUserPoints(userId)
      const unredeemablePoints = await loyaltyService.redeemedPointsForOrder(
        userId,
        orderId,
      )
      if (unredeemablePoints.lt(points)) {
        throw new ValidationError(
          'Cannot unredeem more points than were redeemed for this order',
        )
      }
      const pointsToUnredeem = points
      let pointsToAddBack = pointsToUnredeem
      const pointsData = await tx.query.loyaltyPoints.findMany({
        where: and(
          eq(loyaltyPoints.userId, userId),
          gt(loyaltyPoints.redeemedPoints, '0'),
        ),  
        orderBy: desc(loyaltyPoints.createdAt),
      })
      for (const point of pointsData) {
        if (pointsToAddBack <= 0) {
          break
        }
        const redeemedPoints = Number(point.redeemedPoints) 
        const pointsToUnredeemFromThis = Math.min(pointsToAddBack, redeemedPoints)
        await tx
          .update(loyaltyPoints)
          .set({
            redeemedPoints: (redeemedPoints - pointsToUnredeemFromThis).toString(),
          })
          .where(eq(loyaltyPoints.id, point.id))
        pointsToAddBack -= pointsToUnredeemFromThis
      }
      await loyaltyService.createLog({
        userId,
        orderId,
        points: pointsToUnredeem.toString(),
        type: 'unredeemed',
      })  
      return pointsToUnredeem
    })
  }

  async getLogs(userId: string, order: 'asc' | 'desc' = 'asc') {
    return await this.db.query.loyaltyLogs.findMany({
      where: eq(loyaltyLogs.userId, userId),
      orderBy: order === 'asc' ? asc(loyaltyLogs.createdAt) : desc(loyaltyLogs.createdAt),
    })
  }
}

export { LoyaltyService }
