import { LockMode } from '@mikro-orm/core';
import { getEntityManager } from '../db/db.js';
import { GroupSession, GroupSessionStatus } from '../entities/GroupSession.js';
import { Participant } from '../entities/Participant.js';
import { Product } from '../entities/Product.js';
import { CartItem } from '../entities/CartItem.js';
import { AppError } from '../middlewares/errorHandler.js';

export class CartService {
  /**
   * Adds an item to the collaborative group cart with atomic pessimistic stock reservation.
   */
  async addItem(
    sessionId: string,
    participantId: string,
    productId: string,
    quantity: number = 1
  ) {
    if (quantity <= 0) {
      throw new AppError('Quantity must be greater than 0', 400, 'INVALID_QUANTITY');
    }

    const em = getEntityManager();

    return await em.transactional(async (txEm) => {
      // 1. Validate session
      const session = await txEm.findOne(GroupSession, { id: sessionId });
      if (!session) {
        throw new AppError('Group session not found', 404, 'SESSION_NOT_FOUND');
      }
      if (session.status !== GroupSessionStatus.ACTIVE) {
        throw new AppError('Group session is no longer active', 400, 'SESSION_INACTIVE');
      }

      // 2. Validate participant
      const participant = await txEm.findOne(Participant, {
        id: participantId,
        groupSession: session,
      });
      if (!participant) {
        throw new AppError('Participant not found in this session', 404, 'PARTICIPANT_NOT_FOUND');
      }

      // 3. Pessimistic Row Lock on Product
      const product = await txEm.findOne(
        Product,
        { id: productId },
        { lockMode: LockMode.PESSIMISTIC_WRITE }
      );
      if (!product) {
        throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
      }

      // 4. Validate stock
      if (product.availableStock < quantity) {
        throw new AppError(
          `Insufficient stock for "${product.name}". Only ${product.availableStock} available, requested ${quantity}.`,
          409,
          'INSUFFICIENT_STOCK'
        );
      }

      // 5. Reserve available stock
      product.availableStock -= quantity;

      // 6. Find or create CartItem for this participant and product
      let cartItem = await txEm.findOne(CartItem, {
        groupSession: session,
        product,
        participant,
      });

      if (cartItem) {
        cartItem.quantity += quantity;
      } else {
        cartItem = new CartItem({
          groupSession: session,
          product,
          participant,
          quantity,
        });
        txEm.persist(cartItem);
      }

      // 7. Increment session version
      session.version += 1;

      await txEm.flush();

      // Return full cart state and updated product stock
      const allCartItems = await txEm.find(
        CartItem,
        { groupSession: session },
        { populate: ['product', 'participant'] }
      );

      const formattedCart = allCartItems.map((ci) => ({
        id: ci.id,
        productId: ci.product.id,
        productName: ci.product.name,
        price: ci.product.price,
        imageUrl: ci.product.imageUrl,
        quantity: ci.quantity,
        lineTotal: ci.product.price * ci.quantity,
        participantId: ci.participant.id,
        addedByName: ci.participant.displayName,
      }));

      const totalCartAmount = formattedCart.reduce((sum, i) => sum + i.lineTotal, 0);

      return {
        sessionId: session.id,
        version: session.version,
        totalCartAmount,
        cartItems: formattedCart,
        inventory: {
          productId: product.id,
          availableStock: product.availableStock,
          totalStock: product.totalStock,
          isOutOfStock: product.availableStock <= 0,
          isLowStock: product.availableStock > 0 && product.availableStock <= 3,
        },
      };
    });
  }

  /**
   * Updates the quantity of an item in the shared cart.
   * If newQuantity is 0 or less, removes the item.
   */
  async updateQuantity(
    sessionId: string,
    participantId: string,
    cartItemId: string,
    newQuantity: number
  ) {
    const em = getEntityManager();

    return await em.transactional(async (txEm) => {
      const session = await txEm.findOne(GroupSession, { id: sessionId });
      if (!session) {
        throw new AppError('Group session not found', 404, 'SESSION_NOT_FOUND');
      }
      if (session.status !== GroupSessionStatus.ACTIVE) {
        throw new AppError('Group session is no longer active', 400, 'SESSION_INACTIVE');
      }

      const cartItem = await txEm.findOne(
        CartItem,
        { id: cartItemId, groupSession: session },
        { populate: ['product', 'participant'] }
      );
      if (!cartItem) {
        throw new AppError('Cart item not found', 404, 'CART_ITEM_NOT_FOUND');
      }

      // Pessimistic Row Lock on Product
      const product = await txEm.findOne(
        Product,
        { id: cartItem.product.id },
        { lockMode: LockMode.PESSIMISTIC_WRITE }
      );
      if (!product) {
        throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
      }

      const delta = newQuantity - cartItem.quantity;

      if (delta > 0) {
        // Increasing quantity: check available stock
        if (product.availableStock < delta) {
          throw new AppError(
            `Insufficient stock for "${product.name}". Only ${product.availableStock} more available.`,
            409,
            'INSUFFICIENT_STOCK'
          );
        }
        product.availableStock -= delta;
        cartItem.quantity = newQuantity;
      } else if (delta < 0) {
        // Decreasing quantity: release stock
        const releaseAmount = -delta;
        product.availableStock += releaseAmount;

        if (newQuantity <= 0) {
          txEm.remove(cartItem);
        } else {
          cartItem.quantity = newQuantity;
        }
      }

      session.version += 1;
      await txEm.flush();

      const allCartItems = await txEm.find(
        CartItem,
        { groupSession: session },
        { populate: ['product', 'participant'] }
      );

      const formattedCart = allCartItems.map((ci) => ({
        id: ci.id,
        productId: ci.product.id,
        productName: ci.product.name,
        price: ci.product.price,
        imageUrl: ci.product.imageUrl,
        quantity: ci.quantity,
        lineTotal: ci.product.price * ci.quantity,
        participantId: ci.participant.id,
        addedByName: ci.participant.displayName,
      }));

      const totalCartAmount = formattedCart.reduce((sum, i) => sum + i.lineTotal, 0);

      return {
        sessionId: session.id,
        version: session.version,
        totalCartAmount,
        cartItems: formattedCart,
        inventory: {
          productId: product.id,
          availableStock: product.availableStock,
          totalStock: product.totalStock,
          isOutOfStock: product.availableStock <= 0,
          isLowStock: product.availableStock > 0 && product.availableStock <= 3,
        },
      };
    });
  }

  /**
   * Removes a cart item entirely and restores its stock.
   */
  async removeItem(sessionId: string, participantId: string, cartItemId: string) {
    return await this.updateQuantity(sessionId, participantId, cartItemId, 0);
  }
}

export const cartService = new CartService();
