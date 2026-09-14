import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody } from '../../middlewares/validate.js';
import { orderService } from '../../services/OrderService.js';
import { getEntityManager } from '../../db/db.js';
import { Order } from '../../entities/Order.js';
import { AppError } from '../../middlewares/errorHandler.js';

export const orderRouter = Router();

const SoloOrderSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  items: z
    .array(
      z.object({
        productId: z.string().uuid('Invalid product ID format'),
        quantity: z.number().int().positive('Quantity must be at least 1'),
      })
    )
    .min(1, 'At least one item is required in the order'),
});

// POST /api/orders/solo - place a solo order
orderRouter.post(
  '/solo',
  validateBody(SoloOrderSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { customerName, items } = req.body;
      const order = await orderService.placeSoloOrder(customerName, items);
      res.status(201).json({ order });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/orders/:id - get order confirmation details
orderRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const em = getEntityManager();
    const order = await em.findOne(
      Order,
      { id: req.params.id },
      { populate: ['items', 'items.product'] }
    );

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    res.json({
      order: {
        id: order.id,
        orderType: order.orderType,
        customerName: order.customerName,
        totalAmount: order.totalAmount,
        status: order.status,
        createdAt: order.createdAt,
        items: order.items.$.map((oi) => ({
          id: oi.id,
          productId: oi.product?.id,
          productName: oi.productName,
          price: oi.price,
          quantity: oi.quantity,
          addedByName: oi.addedByName,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});
