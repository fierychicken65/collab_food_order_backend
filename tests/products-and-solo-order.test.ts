import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb } from '../src/db/db.js';
import { seed } from '../src/db/seed.js';
import { orderService } from '../src/services/OrderService.js';
import { Product } from '../src/entities/Product.js';
import { AppError } from '../middlewares/errorHandler.js';

describe('Product Catalog & Solo Order Concurrency', () => {
  let orm: any;

  beforeAll(async () => {
    orm = await initDb(false);
    // Ensure clean seeded database
    await seed();
    // Re-init connection after seed closes it
    orm = await initDb(false);
  });

  afterAll(async () => {
    if (orm) {
      await orm.close();
    }
  });

  it('should list all products from database', async () => {
    const em = orm.em.fork();
    const products = await em.find(Product, {});
    expect(products.length).toBeGreaterThanOrEqual(10);
  });

  it('should successfully place a solo order with atomic stock reduction', async () => {
    const em = orm.em.fork();
    const burger = await em.findOne(Product, { name: 'Classic Smash Cheeseburger' });
    expect(burger).toBeDefined();
    const initialStock = burger!.availableStock;

    const order = await orderService.placeSoloOrder('Alice Solo', [
      { productId: burger!.id, quantity: 2 },
    ]);

    expect(order.id).toBeDefined();
    expect(order.orderType).toBe('NORMAL');
    expect(order.customerName).toBe('Alice Solo');
    expect(order.totalAmount).toBe(burger!.price * 2);
    expect(order.items.length).toBe(1);
    expect(order.items[0].quantity).toBe(2);

    // Verify stock decremented
    const updatedBurger = await em.fork().findOne(Product, { id: burger!.id });
    expect(updatedBurger!.availableStock).toBe(initialStock - 2);
  });

  it('should reject an order exceeding available stock', async () => {
    const em = orm.em.fork();
    // Beer-Battered Crispy Onion Rings has initial stock 2
    const rings = await em.findOne(Product, { name: 'Beer-Battered Crispy Onion Rings' });
    expect(rings).toBeDefined();

    await expect(
      orderService.placeSoloOrder('Bob Overdraw', [
        { productId: rings!.id, quantity: rings!.availableStock + 1 },
      ])
    ).rejects.toThrow(/Insufficient stock/);
  });
});
