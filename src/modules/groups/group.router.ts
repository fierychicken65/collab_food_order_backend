import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody } from '../../middlewares/validate.js';
import { groupService } from '../../services/GroupService.js';
import { getEntityManager } from '../../db/db.js';
import { GroupSession, GroupSessionStatus } from '../../entities/GroupSession.js';
import { AppError } from '../../middlewares/errorHandler.js';

export const groupRouter = Router();

const CreateGroupSchema = z.object({
  hostDisplayName: z
    .string()
    .trim()
    .min(1, 'Host display name cannot be empty')
    .max(50, 'Name cannot exceed 50 characters'),
});

const JoinGroupSchema = z.object({
  code: z
    .string()
    .trim()
    .length(6, 'Join code must be exactly 6 characters')
    .toUpperCase(),
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name cannot be empty')
    .max(50, 'Name cannot exceed 50 characters'),
});

// POST /api/groups - Host creates group order session
groupRouter.post(
  '/',
  validateBody(CreateGroupSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { hostDisplayName } = req.body;
      const result = await groupService.createGroup(hostDisplayName);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/groups/join - Participant joins group session with code
groupRouter.post(
  '/join',
  validateBody(JoinGroupSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code, displayName } = req.body;
      const result = await groupService.joinGroup(code, displayName);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/groups/:id - Get full authoritative session state
groupRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const sessionState = await groupService.getSessionState(id);
    res.json(sessionState);
  } catch (error) {
    next(error);
  }
});

// GET /api/groups/code/:code - Lookup session info by code
groupRouter.get('/code/:code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawCode = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
    const code = rawCode.trim().toUpperCase();
    const em = getEntityManager();
    const session = await em.findOne(
      GroupSession,
      { code, status: GroupSessionStatus.ACTIVE },
      { populate: ['participants'] }
    );

    if (!session) {
      throw new AppError('Active session not found for this code', 404, 'SESSION_NOT_FOUND');
    }

    res.json({
      session: {
        id: session.id,
        code: session.code,
        status: session.status,
        version: session.version,
        participantCount: session.participants.length,
      },
    });
  } catch (error) {
    next(error);
  }
});
