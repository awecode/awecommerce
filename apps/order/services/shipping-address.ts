import { and, desc, eq, ne } from 'drizzle-orm';
import { NewShippingAddress, shippingAddresses, UpdateShippingAddress } from '../schemas';

class ShippingAddressService {
  private db: any;

  constructor(dbInstance: any) {
    this.db = dbInstance;
  }

  async create(data: NewShippingAddress) {
    const address = await this.db.insert(shippingAddresses).values(data).returning();
    if(data.isDefault) {
      await this.db.update(shippingAddresses).set({
        isDefault: false,
      }).where(
        and(
          eq(shippingAddresses.userId, data.userId),
          ne(shippingAddresses.id, address[0].id),
        )
      );
    }
    return address[0];
  }

  async update(userId:string, id: number, data: Omit<UpdateShippingAddress, 'userId'>) {
    const [address] = await this.db.update(shippingAddresses).set(data).where(
     and(
        eq(shippingAddresses.id, id),
        eq(shippingAddresses.userId, userId)
      )
    ).returning()
    if(address && data.isDefault) {
      await this.db.update(shippingAddresses).set({
        isDefault: false,
        updatedAt: new Date().toISOString(),
      }).where(
        and(
          eq(shippingAddresses.userId, address.userId),
          ne(shippingAddresses.id, id),
        )
      );
    }
    return address
  }

  async getAll(userId: string) {
    return await this.db.select().from(shippingAddresses).where(
      eq(shippingAddresses.userId, userId)
    ).orderBy(desc(shippingAddresses.createdAt));
  }

  async get(userId: string, id: number) {
    const [res] = this.db.select().from(shippingAddresses).where(
      and(
        eq(shippingAddresses.userId, userId),
        eq(shippingAddresses.id, id)
      )
    )
    return res
  }

  async getDefault(userId: string) {
    const [res] = await this.db.select().from(shippingAddresses).where(
      and(
        eq(shippingAddresses.userId, userId),
        eq(shippingAddresses.isDefault, true)
      )
    )
    return res
  }

  async markAsDefault(userId: string, id: number) {
    await this.db.update(shippingAddresses).set({
      isDefault: false,
    }).where(
      eq(shippingAddresses.userId, userId)
    );
    return await this.db.update(shippingAddresses).set({
      isDefault: true,
    }).where(
      and(
        eq(shippingAddresses.userId, userId),
        eq(shippingAddresses.id, id)
      )
    );
  }

  async delete(userId:string, id: number) {
    return await this.db.delete(shippingAddresses).where(
      and(
        eq(shippingAddresses.id, id),
        eq(shippingAddresses.userId, userId)
      )
    );
  }
}

export default ShippingAddressService;
