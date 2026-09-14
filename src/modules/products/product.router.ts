import { Router, Request, Response, NextFunction } from 'express';
import { getEntityManager } from '../../db/db.js';
import { Product } from '../../entities/Product.js';
import { AppError } from '../../middlewares/errorHandler.js';

export const productRouter = Router();

// GET /api/products - list all products with live available stock
productRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const em = getEntityManager();
    const products = await em.find(
      Product,
      {},
      {
        orderBy: { category: 'ASC', name: 'ASC' },
      }
    );

    const formatted = products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      imageUrl: p.imageUrl,
      category: p.category,
      totalStock: p.totalStock,
      availableStock: p.availableStock,
      isOutOfStock: p.availableStock <= 0,
      isLowStock: p.availableStock > 0 && p.availableStock <= 3,
    }));

    res.json({ products: formatted });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/:id - single product
productRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const em = getEntityManager();
    const product = await em.findOne(Product, { id: req.params.id });

    if (!product) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    res.json({
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        imageUrl: product.imageUrl,
        category: product.category,
        totalStock: product.totalStock,
        availableStock: product.availableStock,
        isOutOfStock: product.availableStock <= 0,
        isLowStock: product.availableStock > 0 && product.availableStock <= 3,
      },
    });
  } catch (error) {
    next(error);
  }
});
