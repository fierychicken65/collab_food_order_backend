import { LockMode } from '@mikro-orm/core';
import { getEntityManager } from '../db/db.js';
import { Product } from '../entities/Product.js';
import { Order, OrderType, OrderStatus } from '../entities/Order.js';
import { OrderItem } from '../entities/OrderItem.js';
import { GroupSession, GroupSessionStatus } from '../entities/GroupSession.js';
import { AppError } from '../middlewares/errorHandler.js';

export interface SoloOrderItemInput {
  productId: string;
  quantity: number;
}

export class OrderService {
  /**
   * Places a solo order atomically reserving and decrementing stock
   * using PostgreSQL pessimistic row locking (SELECT ... FOR UPDATE).
   */
  async placeSoloOrder(customerName: string, items: SoloOrderItemInput[]) {
    if (!items || items.length === 0) {
      throw new AppError('Order must contain at least one item', 400, 'EMPTY_ORDER');
    }

    const em = getEntityManager();

    return await em.transactional(async (txEm) => {
      let totalAmount = 0;
      const orderItems: OrderItem[] = [];

      // Sort items by productId to guarantee consistent lock ordering and avoid deadlocks
      const sortedItems = [...items].sort((a, b) => a.productId.localeCompare(b.productId));

      for (const item of sortedItems) {
        if (item.quantity <= 0) {
          throw new AppError(`Invalid quantity for product ${item.productId}`, 400, 'INVALID_QUANTITY');
        }

        // Lock row with SELECT ... FOR UPDATE
        const product = await txEm.findOne(
          Product,
          { id: item.productId },
          { lockMode: LockMode.PESSIMISTIC_WRITE }
        );

        if (!product) {
          throw new AppError(`Product with ID ${item.productId} not found`, 404, 'PRODUCT_NOT_FOUND');
        }

        if (product.availableStock < item.quantity) {
          throw new AppError(
            `Insufficient stock for "${product.name}". Only ${product.availableStock} available, requested ${item.quantity}.`,
            409,
            'INSUFFICIENT_STOCK'
          );
        }

        // Decrement stock
        product.availableStock -= item.quantity;
        product.totalStock -= item.quantity;

        const lineTotal = product.price * item.quantity;
        totalAmount += lineTotal;

        const orderItem = new OrderItem({
          product,
          productName: product.name,
          price: product.price,
          quantity: item.quantity,
          addedByName: customerName,
        });

        orderItems.push(orderItem);
      }

      const order = new Order({
        customerName,
        orderType: OrderType.NORMAL,
        totalAmount,
        status: OrderStatus.CONFIRMED,
      });

      txEm.persist(order);

      for (const orderItem of orderItems) {
        orderItem.order = order;
        txEm.persist(orderItem);
      }

      await txEm.flush();

      return {
        id: order.id,
        orderType: order.orderType,
        customerName: order.customerName,
        totalAmount: order.totalAmount,
        status: order.status,
        createdAt: order.createdAt,
        items: orderItems.map((oi) => ({
          id: oi.id,
          productId: oi.product?.id,
          productName: oi.productName,
          price: oi.price,
          quantity: oi.quantity,
          addedByName: oi.addedByName,
        })),
      };
    });
  }

  /**
   * Places a group order, strictly restricted to the host, and only when all participants are ready.
   */
  async placeGroupOrder(sessionId: string, hostParticipantId: string) {
    const em = getEntityManager();

    return await em.transactional(async (txEm) => {
      const session = await txEm.findOne(
        GroupSession,
        { id: sessionId },
        {
          populate: [
            'participants',
            'cartItems',
            'cartItems.product',
            'cartItems.participant',
          ],
        }
      );

      if (!session) {
        throw new AppError('Group session not found', 404, 'SESSION_NOT_FOUND');
      }

      if (session.status !== GroupSessionStatus.ACTIVE) {
        throw new AppError('Group session is no longer active', 400, 'SESSION_INACTIVE');
      }

      // Host verification
      const hostParticipant = session.participants.getItems().find((p) => p.id === hostParticipantId);
      if (!hostParticipant || !hostParticipant.isHost) {
        throw new AppError('Only the host can place the group order', 403, 'HOST_ONLY_CHECKOUT');
      }

      // Cart emptiness check
      if (session.cartItems.length === 0) {
        throw new AppError('Cannot place an order with an empty cart', 400, 'EMPTY_CART');
      }

      // All ready check
      const participants = session.participants.getItems();
      const allReady = participants.length > 0 && participants.every((p) => p.isReady);
      if (!allReady) {
        throw new AppError('All participants must be marked as Ready before checkout', 400, 'NOT_ALL_READY');
      }

      let totalAmount = 0;
      const orderItems: OrderItem[] = [];

      for (const ci of session.cartItems) {
        const product = ci.product;
        // Decrement totalStock (availableStock was already reserved when added to cart)
        product.totalStock -= ci.quantity;

        const lineTotal = product.price * ci.quantity;
        totalAmount += lineTotal;

        const orderItem = new OrderItem({
          product,
          productName: product.name,
          price: product.price,
          quantity: ci.quantity,
          addedByName: ci.participant.displayName,
        });

        orderItems.push(orderItem);
        txEm.remove(ci);
      }

      // Transition session status
      session.status = GroupSessionStatus.ORDER_PLACED;
      session.version += 1;

      // Create permanent Order record
      const order = new Order({
        groupSession: session,
        orderType: OrderType.GROUP,
        customerName: `Group Order (${session.code}) - Host: ${hostParticipant.displayName}`,
        totalAmount,
        status: OrderStatus.CONFIRMED,
      });

      txEm.persist(order);

      for (const oi of orderItems) {
        oi.order = order;
        txEm.persist(oi);
      }

      await txEm.flush();

      return {
        id: order.id,
        orderId: order.id,
        sessionId: session.id,
        sessionCode: session.code,
        hostDisplayName: hostParticipant.displayName,
        totalAmount: order.totalAmount,
        status: order.status,
        createdAt: order.createdAt,
        items: orderItems.map((oi) => ({
          id: oi.id,
          productId: oi.product?.id,
          productName: oi.productName,
          price: oi.price,
          quantity: oi.quantity,
          lineTotal: oi.price * oi.quantity,
          addedByName: oi.addedByName,
        })),
      };
    });
  }
}

export const orderService = new OrderService();
