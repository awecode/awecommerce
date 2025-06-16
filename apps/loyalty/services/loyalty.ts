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

class LoyaltyService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async getSettings() {
    let setting = await this.db.query.loyaltySettings.findFirst({
      columns: {
        id: false,
      },
    })
    if (!setting) {
      const newSetting = await this.db.insert(loyaltySettings).values({}).returning()
      setting = newSetting[0]
    }
    return setting
  }

  async updateSettings(data: UpdateLoyaltySettings) {
    const [setting] = await this.db
      .update(loyaltySettings)
      .set(data)
      .returning()
    if (!setting) {
      await this.db.insert(loyaltySettings).values(data).returning()
    }
  }

  async addLoyaltyPoint(userId: string, orderId: number, price: number, roundOff = false) {
    const settings = await this.getSettings()
    if (!settings.isEnabled || !settings.earnRate) {
      return
    }
    let earnedPoints = price * Number(settings.earnRate)
    if(roundOff) {
      earnedPoints = Math.round(earnedPoints)
    }
    await this.db.insert(loyaltyPoints).values({
      userId,
      orderId,
      earnedPoints: earnedPoints.toString(),
    })
    await this.createLog({
      userId,
      orderId,
      points: earnedPoints.toString(),
      type: 'earned',
    })
    return earnedPoints
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
          lt(loyaltyPoints.expiresAt, new Date()),
        ),
        lt(loyaltyPoints.redeemedPoints, loyaltyPoints.earnedPoints),
      ),
    })
    return points.reduce(
      (acc: number, point: LoyaltyPoints) =>
        acc + Number(point.earnedPoints) - Number(point.redeemedPoints),
      0,
    )
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
      (acc: number, point: LoyaltyPoints) =>
        acc + Number(point.earnedPoints) - Number(point.redeemedPoints),
      0,
    )

    return {
      points,
      totalRedeemablePoints,
      totalRedeemableValue: settings.redeemRate
        ? totalRedeemablePoints * Number(settings.redeemRate)
        : 0,
    }
  }

  async redeemPoints(userId: string, orderId: number, points: number) {
    const pointsToRedeem = points
    let pointsToDeduct = pointsToRedeem
    const pointsData = await this.db.query.loyaltyPoints.findMany({
      where: and(
        eq(loyaltyPoints.userId, userId),
        or(
          isNull(loyaltyPoints.expiresAt),
          lt(loyaltyPoints.expiresAt, new Date()),
        ),
        lt(loyaltyPoints.redeemedPoints, loyaltyPoints.earnedPoints),
      ),
      orderBy: asc(loyaltyPoints.createdAt),
    })
    for (const point of pointsData) {
      if (pointsToDeduct <= 0) {
        break
      }
      const redeemablePoints =
        Number(point.earnedPoints) - Number(point.redeemedPoints)
      const pointsToRedeemFromThis = Math.min(pointsToDeduct, redeemablePoints)
      await this.db
        .update(loyaltyPoints)
        .set({
          redeemedPoints: (Number(point.redeemedPoints) + pointsToRedeemFromThis).toString(),
        })
        .where(eq(loyaltyPoints.id, point.id))
      pointsToDeduct -= pointsToRedeemFromThis
    }
    await this.createLog({
      userId,
      orderId,
      points: pointsToRedeem.toString(),
      type: 'redeemed',
    })
    return pointsToRedeem
  }

  async unredeemPoints(userId: string, orderId: number, points: number) {
    const pointsToUnredeem = points
    let pointsToAddBack = pointsToUnredeem
    const pointsData = await this.db.query.loyaltyPoints.findMany({
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
      await this.db
        .update(loyaltyPoints)
        .set({
          redeemedPoints: (redeemedPoints - pointsToUnredeemFromThis).toString(),
        })
        .where(eq(loyaltyPoints.id, point.id))
      pointsToAddBack -= pointsToUnredeemFromThis
    }
    await this.createLog({
      userId,
      orderId,
      points: pointsToUnredeem.toString(),
      type: 'earned',
    })  
    return pointsToUnredeem
  }

  async getLogs(userId: string, order: 'asc' | 'desc' = 'asc') {
    return await this.db.query.loyaltyLogs.findMany({
      where: eq(loyaltyLogs.userId, userId),
      orderBy: order === 'asc' ? asc(loyaltyLogs.createdAt) : desc(loyaltyLogs.createdAt),
    })
  }
}

export { LoyaltyService }
