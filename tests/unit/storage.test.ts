/**
 * Unit Tests for Storage Backends
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { MemoryStorage, resetMemoryStorage } from '../../src/storage/memory';
import { FileStorage } from '../../src/storage/file';
import { rmSync, existsSync } from 'fs';
import type { RegisteredAgent } from '../../src/types';

// Helper to create test agent
function createTestAgent(overrides: Partial<RegisteredAgent> = {}): RegisteredAgent {
  return {
    agentId: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: 'test-agent',
    lifespan: 'turn',
    scope: 'test-scope',
    model: 'haiku',
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    turnCount: 0,
    metadata: {},
    ...overrides,
  };
}

// ===========================================================================
// Memory Storage Tests
// ===========================================================================

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    resetMemoryStorage();
    storage = new MemoryStorage();
  });

  describe('save() and load()', () => {
    test('saves and loads agent', async () => {
      const agent = createTestAgent();

      await storage.save(agent);
      const loaded = await storage.load(agent.agentId);

      expect(loaded).not.toBeNull();
      expect(loaded!.agentId).toBe(agent.agentId);
      expect(loaded!.name).toBe(agent.name);
    });

    test('returns null for non-existent agent', async () => {
      const loaded = await storage.load('non-existent');
      expect(loaded).toBeNull();
    });

    test('overwrites existing agent', async () => {
      const agent = createTestAgent();
      await storage.save(agent);

      agent.turnCount = 5;
      await storage.save(agent);

      const loaded = await storage.load(agent.agentId);
      expect(loaded!.turnCount).toBe(5);
    });
  });

  describe('findByNameAndScope()', () => {
    test('finds agent by name and scope', async () => {
      const agent = createTestAgent({ name: 'shadow', scope: 'session-123' });
      await storage.save(agent);

      const found = await storage.findByNameAndScope('shadow', 'session-123');

      expect(found).not.toBeNull();
      expect(found!.agentId).toBe(agent.agentId);
    });

    test('returns null for wrong scope', async () => {
      const agent = createTestAgent({ name: 'shadow', scope: 'session-123' });
      await storage.save(agent);

      const found = await storage.findByNameAndScope('shadow', 'wrong-scope');
      expect(found).toBeNull();
    });

    test('returns null for wrong name', async () => {
      const agent = createTestAgent({ name: 'shadow', scope: 'session-123' });
      await storage.save(agent);

      const found = await storage.findByNameAndScope('wrong-name', 'session-123');
      expect(found).toBeNull();
    });
  });

  describe('delete()', () => {
    test('deletes agent', async () => {
      const agent = createTestAgent();
      await storage.save(agent);

      await storage.delete(agent.agentId);

      const loaded = await storage.load(agent.agentId);
      expect(loaded).toBeNull();
    });

    test('no-op for non-existent agent', async () => {
      // Should not throw
      await storage.delete('non-existent');
    });
  });

  describe('deleteMany()', () => {
    test('deletes by lifespan', async () => {
      await storage.save(createTestAgent({ lifespan: 'turn', name: 'turn-1' }));
      await storage.save(createTestAgent({ lifespan: 'turn', name: 'turn-2' }));
      await storage.save(createTestAgent({ lifespan: 'context', name: 'ctx-1' }));

      const deleted = await storage.deleteMany({ lifespan: 'turn' });

      expect(deleted).toBe(2);
      expect(storage.size).toBe(1);
    });

    test('deletes by scope', async () => {
      await storage.save(createTestAgent({ scope: 'scope-a', name: 'a1' }));
      await storage.save(createTestAgent({ scope: 'scope-a', name: 'a2' }));
      await storage.save(createTestAgent({ scope: 'scope-b', name: 'b1' }));

      const deleted = await storage.deleteMany({ scope: 'scope-a' });

      expect(deleted).toBe(2);
      expect(storage.size).toBe(1);
    });
  });

  describe('list()', () => {
    test('lists all agents', async () => {
      await storage.save(createTestAgent({ name: 'agent-1' }));
      await storage.save(createTestAgent({ name: 'agent-2' }));

      const agents = await storage.list();

      expect(agents.length).toBe(2);
    });

    test('filters by criteria', async () => {
      await storage.save(createTestAgent({ lifespan: 'turn', name: 'turn-1' }));
      await storage.save(createTestAgent({ lifespan: 'context', name: 'ctx-1' }));

      const turnAgents = await storage.list({ lifespan: 'turn' });

      expect(turnAgents.length).toBe(1);
      expect(turnAgents[0].lifespan).toBe('turn');
    });
  });
});

// ===========================================================================
// File Storage Tests
// ===========================================================================

describe('FileStorage', () => {
  const TEST_PATH = '.agent/test-file-storage';

  beforeEach(() => {
    if (existsSync(TEST_PATH)) {
      rmSync(TEST_PATH, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_PATH)) {
      rmSync(TEST_PATH, { recursive: true });
    }
  });

  describe('session storage', () => {
    let storage: FileStorage;

    beforeEach(() => {
      storage = new FileStorage({ basePath: TEST_PATH, lifespan: 'session' });
    });

    test('saves and loads session agent', async () => {
      const agent = createTestAgent({
        lifespan: 'session',
        scope: 'session-abc',
        name: 'shadow',
      });

      await storage.save(agent);
      const found = await storage.findByNameAndScope('shadow', 'session-abc');

      expect(found).not.toBeNull();
      expect(found!.agentId).toBe(agent.agentId);
    });

    test('creates directory structure', async () => {
      const agent = createTestAgent({
        lifespan: 'session',
        scope: 'new-session',
        name: 'agent',
      });

      await storage.save(agent);

      expect(existsSync(`${TEST_PATH}/session/new-session/agent.json`)).toBe(true);
    });

    test('lists agents across scopes', async () => {
      await storage.save(createTestAgent({
        lifespan: 'session',
        scope: 'session-1',
        name: 'agent-1',
      }));
      await storage.save(createTestAgent({
        lifespan: 'session',
        scope: 'session-2',
        name: 'agent-2',
      }));

      const agents = await storage.list();

      expect(agents.length).toBe(2);
    });
  });

  describe('workflow storage', () => {
    let storage: FileStorage;

    beforeEach(() => {
      storage = new FileStorage({ basePath: TEST_PATH, lifespan: 'workflow' });
    });

    test('saves and loads workflow agent', async () => {
      const agent = createTestAgent({
        lifespan: 'workflow',
        scope: 'FEAT-001',
        name: 'executor',
      });

      await storage.save(agent);
      const found = await storage.findByNameAndScope('executor', 'FEAT-001');

      expect(found).not.toBeNull();
      expect(found!.scope).toBe('FEAT-001');
    });

    test('deletes all agents for workflow', async () => {
      await storage.save(createTestAgent({
        lifespan: 'workflow',
        scope: 'FEAT-002',
        name: 'agent-1',
      }));
      await storage.save(createTestAgent({
        lifespan: 'workflow',
        scope: 'FEAT-002',
        name: 'agent-2',
      }));

      const deleted = await storage.deleteMany({ scope: 'FEAT-002' });

      expect(deleted).toBe(2);
      expect(await storage.list()).toHaveLength(0);
    });
  });

  describe('project storage', () => {
    let storage: FileStorage;

    beforeEach(() => {
      storage = new FileStorage({ basePath: TEST_PATH, lifespan: 'project' });
    });

    test('saves and loads project agent', async () => {
      const agent = createTestAgent({
        lifespan: 'project',
        scope: process.cwd(),
        name: 'architect',
      });

      await storage.save(agent);
      const found = await storage.findByNameAndScope('architect', process.cwd());

      expect(found).not.toBeNull();
      expect(found!.name).toBe('architect');
    });

    test('stores directly in project folder', async () => {
      const agent = createTestAgent({
        lifespan: 'project',
        scope: process.cwd(),
        name: 'test-project-agent',
      });

      await storage.save(agent);

      expect(existsSync(`${TEST_PATH}/project/test-project-agent.json`)).toBe(true);
    });
  });
});
