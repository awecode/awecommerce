import { desc, eq } from 'drizzle-orm';
import { NewShippingMethod, shippingMethods, UpdateShippingMethod } from '../schemas';
import { Database } from '../../types';

class ShippingMethodService {
    private db: Database;

    constructor(dbInstance: Database) {
        this.db = dbInstance;
    }

    async create(data: NewShippingMethod) {
        const method = await this.db.insert(shippingMethods).values(data).returning();
        return method[0];
    }

    async update(id: number, data: UpdateShippingMethod) {
        const [method] = await this.db.update(shippingMethods).set(data).where(
            eq(shippingMethods.id, id)
        ).returning();
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

    async delete(id: number) {
        return await this.db.delete(shippingMethods).where(
            eq(shippingMethods.id, id)
        );
    }
}

export  {
    ShippingMethodService
};
