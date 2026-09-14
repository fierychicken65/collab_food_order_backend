import { LockMode } from '@mikro-orm/core';
import { getEntityManager } from '../db/db.js';
import { Product } from '../entities/Product.js';
import { Order, OrderType, OrderStatus } from '../entities/Order.js';
import { OrderItem } from '../entities/OrderItem.js';
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
}

export const orderService = new OrderService();
