import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb, getEntityManager } from '../src/db/db.js';
import { seed } from '../src/db/seed.js';
import { groupService } from '../src/services/GroupService.js';
import { cartService } from '../src/services/CartService.js';
import { Product } from '../src/entities/Product.js';
import { CartItem } from '../src/entities/CartItem.js';

describe('Collaborative Cart & Concurrency (Pessimistic Locking)', () => {
  let orm: any;

  beforeAll(async () => {
    orm = await initDb(false);
    await seed();
    orm = await initDb(false);
  });

  afterAll(async () => {
    if (orm) {
      await orm.close();
    }
  });

  it('should add items with user attribution and calculate total correctly', async () => {
    const host = await groupService.createGroup('Alice');
    const guest = await groupService.joinGroup(host.session.code, 'Bob');

    const em = getEntityManager().fork();
    const product = await em.findOneOrFail(Product, { name: 'Classic Smash Cheeseburger' });
    const initialStock = product.availableStock;

    // Alice adds 2 burgers
    const aliceCart = await cartService.addItem(host.session.id, host.participant.id, product.id, 2);
    expect(aliceCart.cartItems.length).toBe(1);
    expect(aliceCart.cartItems[0].addedByName).toBe('Alice');
    expect(aliceCart.cartItems[0].quantity).toBe(2);
    expect(aliceCart.inventory.availableStock).toBe(initialStock - 2);

    // Bob adds 1 burger
    const bobCart = await cartService.addItem(host.session.id, guest.participant.id, product.id, 1);
    expect(bobCart.cartItems.length).toBe(2);

    const aliceItem = bobCart.cartItems.find((i) => i.participantId === host.participant.id);
    const bobItem = bobCart.cartItems.find((i) => i.participantId === guest.participant.id);
    expect(aliceItem?.addedByName).toBe('Alice');
    expect(aliceItem?.quantity).toBe(2);
    expect(bobItem?.addedByName).toBe('Bob');
    expect(bobItem?.quantity).toBe(1);

    expect(bobCart.totalCartAmount).toBe(product.price * 3);
    expect(bobCart.inventory.availableStock).toBe(initialStock - 3);

    // Alice removes her item, stock should be restored by 2
    const afterRemove = await cartService.removeItem(host.session.id, host.participant.id, aliceItem!.id);
    expect(afterRemove.cartItems.length).toBe(1);
    expect(afterRemove.cartItems[0].addedByName).toBe('Bob');
    expect(afterRemove.inventory.availableStock).toBe(initialStock - 1);
  });

  it('should handle concurrent stock competition with pessimistic row locking', async () => {
    const em = getEntityManager().fork();

    // Create a limited stock item with exactly 1 unit
    const rareItem = new Product({
      name: `Limited Dragon Burger ${Date.now()}`,
      description: 'Only 1 left in the world',
      price: 1999,
      imageUrl: 'https://example.com/dragon.jpg',
      category: 'Burgers',
      totalStock: 1,
      availableStock: 1,
    });
    em.persist(rareItem);
    await em.flush();

    const host = await groupService.createGroup('User 1');
    const guest = await groupService.joinGroup(host.session.code, 'User 2');

    // Both attempt to claim the last unit simultaneously
    const results = await Promise.allSettled([
      cartService.addItem(host.session.id, host.participant.id, rareItem.id, 1),
      cartService.addItem(host.session.id, guest.participant.id, rareItem.id, 1),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectedError.message).toMatch(/Insufficient stock/i);

    // Verify DB state: availableStock is 0, never negative
    const freshProduct = await getEntityManager().fork().findOneOrFail(Product, { id: rareItem.id });
    expect(freshProduct.availableStock).toBe(0);

    // Clean up temporary test items
    const cleanupEm = getEntityManager().fork();
    await cleanupEm.nativeDelete(CartItem, { product: rareItem });
    await cleanupEm.nativeDelete(Product, { id: rareItem.id });
  });
});
