import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb, getEntityManager } from '../src/db/db.js';
import { seed } from '../src/db/seed.js';
import { groupService } from '../src/services/GroupService.js';
import { cartService } from '../src/services/CartService.js';
import { orderService } from '../src/services/OrderService.js';
import { Product } from '../src/entities/Product.js';
import { GroupSessionStatus } from '../src/entities/GroupSession.js';

describe('Group Readiness Toggling & Host-Only Checkout', () => {
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

  it('should toggle readiness and compute allReady accurately', async () => {
    const host = await groupService.createGroup('Alice');
    const guest = await groupService.joinGroup(host.session.code, 'Bob');

    // Initially neither is ready
    let state = await groupService.getSessionState(host.session.id);
    expect(state.session.allReady).toBe(false);

    // Alice marks ready
    const aliceReady = await groupService.toggleReady(host.session.id, host.participant.id);
    expect(aliceReady.isReady).toBe(true);
    expect(aliceReady.allReady).toBe(false); // Bob still not ready

    // Bob marks ready
    const bobReady = await groupService.toggleReady(host.session.id, guest.participant.id);
    expect(bobReady.isReady).toBe(true);
    expect(bobReady.allReady).toBe(true); // Both ready!

    // Alice unmarks ready ("still browsing")
    const aliceUnready = await groupService.toggleReady(host.session.id, host.participant.id);
    expect(aliceUnready.isReady).toBe(false);
    expect(aliceUnready.allReady).toBe(false);
  });

  it('should reject checkout by non-host participants', async () => {
    const host = await groupService.createGroup('Host Sarah');
    const guest = await groupService.joinGroup(host.session.code, 'Guest Tom');

    await expect(
      orderService.placeGroupOrder(host.session.id, guest.participant.id)
    ).rejects.toThrow(/Only the host can place the group order/i);
  });

  it('should reject host checkout if cart is empty or participants are not all ready', async () => {
    const host = await groupService.createGroup('Host Sarah');
    const guest = await groupService.joinGroup(host.session.code, 'Guest Tom');

    // Attempt checkout on empty cart
    await expect(
      orderService.placeGroupOrder(host.session.id, host.participant.id)
    ).rejects.toThrow(/Cannot place an order with an empty cart/i);

    // Add item to cart
    const em = getEntityManager().fork();
    const burger = await em.findOneOrFail(Product, { name: 'Classic Smash Cheeseburger' });
    await cartService.addItem(host.session.id, host.participant.id, burger.id, 1);

    // Attempt checkout when participants are not ready
    await expect(
      orderService.placeGroupOrder(host.session.id, host.participant.id)
    ).rejects.toThrow(/All participants must be marked as Ready/i);
  });

  it('should successfully place group order when all ready, attributing items and completing session', async () => {
    const host = await groupService.createGroup('Host Elena');
    const guest = await groupService.joinGroup(host.session.code, 'Guest Lucas');

    const em = getEntityManager().fork();
    const burger = await em.findOneOrFail(Product, { name: 'Classic Smash Cheeseburger' });
    const fries = await em.findOneOrFail(Product, { name: 'Loaded Truffle Parmesan Fries' });

    const initialBurgerTotalStock = burger.totalStock;

    // Elena adds burger, Lucas adds fries
    await cartService.addItem(host.session.id, host.participant.id, burger.id, 2);
    await cartService.addItem(host.session.id, guest.participant.id, fries.id, 1);

    // Both toggle ready
    await groupService.toggleReady(host.session.id, host.participant.id);
    await groupService.toggleReady(host.session.id, guest.participant.id);

    // Host checks out
    const orderResult = await orderService.placeGroupOrder(host.session.id, host.participant.id);

    expect(orderResult.orderId).toBeDefined();
    expect(orderResult.sessionId).toBe(host.session.id);
    expect(orderResult.hostDisplayName).toBe('Host Elena');
    expect(orderResult.status).toBe('CONFIRMED');
    expect(orderResult.totalAmount).toBe(burger.price * 2 + fries.price * 1);
    expect(orderResult.items.length).toBe(2);

    // Verify item attribution in finalized order
    const burgerItem = orderResult.items.find((i) => i.productId === burger.id);
    const friesItem = orderResult.items.find((i) => i.productId === fries.id);
    expect(burgerItem?.addedByName).toBe('Host Elena');
    expect(burgerItem?.quantity).toBe(2);
    expect(friesItem?.addedByName).toBe('Guest Lucas');
    expect(friesItem?.quantity).toBe(1);

    // Verify session status is ORDER_PLACED
    const sessionState = await groupService.getSessionState(host.session.id);
    expect(sessionState.session.status).toBe(GroupSessionStatus.ORDER_PLACED);
    expect(sessionState.cartItems.length).toBe(0); // Cart items moved to order

    // Verify product totalStock decremented
    const freshBurger = await getEntityManager().fork().findOneOrFail(Product, { id: burger.id });
    expect(freshBurger.totalStock).toBe(initialBurgerTotalStock - 2);
  });
});
