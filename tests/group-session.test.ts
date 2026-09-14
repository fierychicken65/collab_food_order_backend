import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb } from '../src/db/db.js';
import { seed } from '../src/db/seed.js';
import { groupService } from '../src/services/GroupService.js';
import { AppError } from '../middlewares/errorHandler.js';

describe('Group Session Lifecycle (Create, Join, State)', () => {
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

  it('should create a group session with 6-character code and host participant', async () => {
    const result = await groupService.createGroup('Host Alice');

    expect(result.session).toBeDefined();
    expect(result.session.id).toBeDefined();
    expect(result.session.code.length).toBe(6);
    expect(result.session.status).toBe('ACTIVE');
    expect(result.session.version).toBe(1);

    expect(result.participant).toBeDefined();
    expect(result.participant.displayName).toBe('Host Alice');
    expect(result.participant.isHost).toBe(true);
    expect(result.participant.isReady).toBe(false);
    expect(result.session.hostParticipantId).toBe(result.participant.id);
  });

  it('should allow another user to join an active session with valid join code', async () => {
    const hostResult = await groupService.createGroup('Host Charlie');
    const code = hostResult.session.code;

    const joinResult = await groupService.joinGroup(code, 'Guest David');

    expect(joinResult.session.id).toBe(hostResult.session.id);
    expect(joinResult.session.version).toBe(2);

    expect(joinResult.participant.displayName).toBe('Guest David');
    expect(joinResult.participant.isHost).toBe(false);
    expect(joinResult.participant.isReady).toBe(false);

    // Verify full state has both participants
    const state = await groupService.getSessionState(hostResult.session.id);
    expect(state.participants.length).toBe(2);
    expect(state.participants.map((p) => p.displayName)).toContain('Host Charlie');
    expect(state.participants.map((p) => p.displayName)).toContain('Guest David');
  });

  it('should reject joining with invalid or non-existent code', async () => {
    await expect(groupService.joinGroup('SHORT', 'Guest')).rejects.toThrow(/must be 6 characters/);
    await expect(groupService.joinGroup('ZZZZZZ', 'Guest')).rejects.toThrow(/Active group session not found/);
  });
});
