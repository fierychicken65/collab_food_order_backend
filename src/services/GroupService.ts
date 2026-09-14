import { getEntityManager } from '../db/db.js';
import { GroupSession, GroupSessionStatus } from '../entities/GroupSession.js';
import { Participant } from '../entities/Participant.js';
import { Product } from '../entities/Product.js';
import { AppError } from '../middlewares/errorHandler.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class GroupService {
  /**
   * Generates a random 6-character alphanumeric uppercase code.
   */
  private generateCode(): string {
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
    }
    return result;
  }

  /**
   * Creates a new group session with a unique join code and adds the host participant.
   */
  async createGroup(hostDisplayName: string) {
    if (!hostDisplayName || hostDisplayName.trim().length === 0) {
      throw new AppError('Host display name is required', 400, 'INVALID_NAME');
    }

    const em = getEntityManager();

    return await em.transactional(async (txEm) => {
      // Generate a unique 6-character code
      let code = '';
      let isUnique = false;
      let attempts = 0;

      while (!isUnique && attempts < 10) {
        code = this.generateCode();
        const existing = await txEm.findOne(GroupSession, {
          code,
          status: GroupSessionStatus.ACTIVE,
        });
        if (!existing) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        throw new AppError('Failed to generate unique session code. Please try again.', 500);
      }

      const session = new GroupSession({
        code,
        status: GroupSessionStatus.ACTIVE,
        version: 1,
      });

      const hostParticipant = new Participant({
        displayName: hostDisplayName.trim(),
        isHost: true,
        isReady: false,
        isOnline: false,
        groupSession: session,
      });

      session.hostParticipantId = hostParticipant.id;

      txEm.persist(session);
      txEm.persist(hostParticipant);
      await txEm.flush();

      return {
        session: {
          id: session.id,
          code: session.code,
          status: session.status,
          version: session.version,
          hostParticipantId: session.hostParticipantId,
          createdAt: session.createdAt,
        },
        participant: {
          id: hostParticipant.id,
          displayName: hostParticipant.displayName,
          isHost: hostParticipant.isHost,
          isReady: hostParticipant.isReady,
          isOnline: hostParticipant.isOnline,
        },
      };
    });
  }

  /**
   * Joins an active group session using a 6-character code.
   */
  async joinGroup(rawCode: string, displayName: string) {
    const code = rawCode.trim().toUpperCase();
    if (code.length !== 6) {
      throw new AppError('Join code must be 6 characters', 400, 'INVALID_CODE');
    }
    if (!displayName || displayName.trim().length === 0) {
      throw new AppError('Display name is required', 400, 'INVALID_NAME');
    }

    const em = getEntityManager();

    return await em.transactional(async (txEm) => {
      const session = await txEm.findOne(
        GroupSession,
        { code, status: GroupSessionStatus.ACTIVE },
        { populate: ['participants'] }
      );

      if (!session) {
        throw new AppError('Active group session not found for this code', 404, 'SESSION_NOT_FOUND');
      }

      if (session.status !== GroupSessionStatus.ACTIVE) {
        throw new AppError('This group order has already ended', 400, 'SESSION_INACTIVE');
      }

      const participant = new Participant({
        displayName: displayName.trim(),
        isHost: false,
        isReady: false,
        isOnline: false,
        groupSession: session,
      });

      session.version += 1;

      txEm.persist(participant);
      await txEm.flush();

      return {
        session: {
          id: session.id,
          code: session.code,
          status: session.status,
          version: session.version,
          hostParticipantId: session.hostParticipantId,
          createdAt: session.createdAt,
        },
        participant: {
          id: participant.id,
          displayName: participant.displayName,
          isHost: participant.isHost,
          isReady: participant.isReady,
          isOnline: participant.isOnline,
        },
      };
    });
  }

  /**
   * Retrieves complete authoritative session state.
   */
  async getSessionState(sessionId: string) {
    const em = getEntityManager();

    const session = await em.findOne(
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

    // Fetch live product stock levels
    const products = await em.find(
      Product,
      {},
      { orderBy: { category: 'ASC', name: 'ASC' } }
    );

    const participantsList = session.participants.$.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      isHost: p.isHost,
      isReady: p.isReady,
      isOnline: p.isOnline,
      joinedAt: p.joinedAt,
    }));

    // All participants ready check
    const allReady =
      participantsList.length > 0 && participantsList.every((p) => p.isReady);

    const cartItemsList = session.cartItems.$.map((ci) => ({
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

    const totalCartAmount = cartItemsList.reduce((sum, item) => sum + item.lineTotal, 0);

    return {
      session: {
        id: session.id,
        code: session.code,
        status: session.status,
        version: session.version,
        hostParticipantId: session.hostParticipantId,
        allReady,
        totalCartAmount,
        createdAt: session.createdAt,
      },
      participants: participantsList,
      cartItems: cartItemsList,
      products: products.map((p) => ({
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
      })),
    };
  }

  /**
   * Updates participant online presence status.
   */
  async updateParticipantPresence(participantId: string, isOnline: boolean) {
    const em = getEntityManager();
    const participant = await em.findOne(Participant, { id: participantId }, { populate: ['groupSession'] });
    if (!participant) return null;

    participant.isOnline = isOnline;
    participant.lastActiveAt = new Date();
    await em.flush();

    return {
      sessionId: participant.groupSession.id,
      participantId: participant.id,
      displayName: participant.displayName,
      isHost: participant.isHost,
      isReady: participant.isReady,
      isOnline: participant.isOnline,
    };
  }
}

export const groupService = new GroupService();
