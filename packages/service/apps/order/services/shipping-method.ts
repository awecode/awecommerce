import { desc, eq } from 'drizzle-orm';
import { NewShippingMethod, shippingMethods, UpdateShippingMethod } from '../schemas';
import { Database } from '../../types';
import { NotFoundError } from '../../../core/errors';

class ShippingMethodService {
    private db: Database;

    constructor(dbInstance: any) {
        this.db = dbInstance as Database;
    }

    async create(data: NewShippingMethod) {
        const method = await this.db.insert(shippingMethods).values(data).returning();
        return method[0];
    }

    async update(id: number, data: UpdateShippingMethod) {
        const [method] = await this.db.update(shippingMethods).set(data).where(
            eq(shippingMethods.id, id)
        ).returning();
        if (!method) {
            throw new NotFoundError(`Shipping method not found: ${id}`);
        }
        return method;
    }

    async list() {
        return await this.db.select().from(shippingMethods).orderBy(desc(shippingMethods.createdAt));
    }

    async get(id: number) {
        const [res] = await this.db.select().from(shippingMethods).where(
            eq(shippingMethods.id, id)
        );
        return res;
    }

    // Orders keep their own copy of the method they used, so deleting is allowed
    async delete(id: number) {
        const [method] = await this.db.delete(shippingMethods).where(
            eq(shippingMethods.id, id)
        ).returning();
        if (!method) {
            throw new NotFoundError(`Shipping method not found: ${id}`);
        }
        return method;
    }
}

export  {
    ShippingMethodService
};
