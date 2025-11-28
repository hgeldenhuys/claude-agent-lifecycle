/**
 * Unit Tests for AgentRegistry
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { AgentRegistry, resetRegistry } from '../../src/registry';
import { resetMemoryStorage } from '../../src/storage/memory';
import { rmSync, existsSync } from 'fs';
import type { RegisteredAgent } from '../../src/types';

const TEST_STORAGE_PATH = '.agent/test-agents';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    // Clean up any previous state
    resetRegistry();
    resetMemoryStorage();
    if (existsSync(TEST_STORAGE_PATH)) {
      rmSync(TEST_STORAGE_PATH, { recursive: true });
    }
    registry = new AgentRegistry({ storagePath: TEST_STORAGE_PATH });
  });

  afterEach(() => {
    // Clean up test storage
    if (existsSync(TEST_STORAGE_PATH)) {
      rmSync(TEST_STORAGE_PATH, { recursive: true });
    }
  });

  // ===========================================================================
  // Creation Tests
  // ===========================================================================

  describe('create()', () => {
    test('creates ephemeral agent', async () => {
      const { agent, isNew } = await registry.create({
        lifespan: 'ephemeral',
        name: 'test-agent',
      });

      expect(isNew).toBe(true);
      expect(agent.name).toBe('test-agent');
      expect(agent.lifespan).toBe('ephemeral');
      expect(agent.agentId).toBeDefined();
    });

    test('creates turn-scoped agent', async () => {
      const { agent, isNew } = await registry.create({
        lifespan: 'turn',
        name: 'turn-agent',
        model: 'haiku',
      });

      expect(isNew).toBe(true);
      expect(agent.lifespan).toBe('turn');
      expect(agent.model).toBe('haiku');
    });

    test('creates session-scoped agent', async () => {
      const { agent, isNew } = await registry.create({
        lifespan: 'session',
        name: 'session-agent',
        sessionId: 'test-session-123',
      });

      expect(isNew).toBe(true);
      expect(agent.lifespan).toBe('session');
      expect(agent.scope).toBe('test-session-123');
    });

    test('creates workflow-scoped agent', async () => {
      const { agent, isNew } = await registry.create({
        lifespan: 'workflow',
        name: 'workflow-agent',
        workflowId: 'FEAT-001',
        workflowType: 'loom-story',
      });

      expect(isNew).toBe(true);
      expect(agent.lifespan).toBe('workflow');
      expect(agent.scope).toBe('FEAT-001');
      expect(agent.metadata.workflowType).toBe('loom-story');
    });

    test('creates project-scoped agent', async () => {
      const { agent, isNew } = await registry.create({
        lifespan: 'project',
        name: 'project-agent',
      });

      expect(isNew).toBe(true);
      expect(agent.lifespan).toBe('project');
    });

    test('returns existing agent instead of creating duplicate', async () => {
      // Create first
      const { agent: first, isNew: isNew1 } = await registry.create({
        lifespan: 'turn',
        name: 'dedup-test',
      });

      // Try to create again
      const { agent: second, isNew: isNew2 } = await registry.create({
        lifespan: 'turn',
        name: 'dedup-test',
      });

      expect(isNew1).toBe(true);
      expect(isNew2).toBe(false);
      expect(first.agentId).toBe(second.agentId);
    });

    test('throws on invalid config - missing name', async () => {
      await expect(
        registry.create({ lifespan: 'turn', name: '' })
      ).rejects.toThrow('Agent name is required');
    });

    test('throws on invalid config - workflow without workflowId', async () => {
      await expect(
        registry.create({ lifespan: 'workflow', name: 'test' } as any)
      ).rejects.toThrow('workflowId is required');
    });
  });

  // ===========================================================================
  // Resumption Tests
  // ===========================================================================

  describe('resume()', () => {
    test('resumes existing agent', async () => {
      // Create
      const { agent: created } = await registry.create({
        lifespan: 'turn',
        name: 'resume-test',
      });

      // Resume
      const resumed = await registry.resume('resume-test');

      expect(resumed.agentId).toBe(created.agentId);
      expect(resumed.turnCount).toBe(1); // Incremented
    });

    test('throws on non-existent agent', async () => {
      await expect(
        registry.resume('non-existent')
      ).rejects.toThrow('Agent not found');
    });

    test('resumes with explicit scope', async () => {
      // Create session-scoped
      await registry.create({
        lifespan: 'session',
        name: 'scoped-agent',
        sessionId: 'session-abc',
      });

      // Resume with scope
      const resumed = await registry.resume('scoped-agent', 'session-abc');
      expect(resumed.scope).toBe('session-abc');
    });
  });

  // ===========================================================================
  // Disposal Tests
  // ===========================================================================

  describe('dispose()', () => {
    test('disposes agent by ID', async () => {
      const { agent } = await registry.create({
        lifespan: 'turn',
        name: 'dispose-test',
      });

      await registry.dispose(agent.agentId);

      const found = await registry.get(agent.agentId);
      expect(found).toBeNull();
    });

    test('no-op for non-existent agent', async () => {
      // Should not throw
      await registry.dispose('non-existent-id');
    });
  });

  describe('disposeByLifespan()', () => {
    test('disposes all turn-scoped agents', async () => {
      // Create multiple turn agents
      await registry.create({ lifespan: 'turn', name: 'turn-1' });
      await registry.create({ lifespan: 'turn', name: 'turn-2' });
      await registry.create({ lifespan: 'session', name: 'session-1', sessionId: 'test' });

      const disposed = await registry.disposeByLifespan('turn');

      expect(disposed).toBe(2);

      // Session agent should still exist
      const remaining = await registry.list();
      expect(remaining.length).toBe(1);
      expect(remaining[0].name).toBe('session-1');
    });
  });

  describe('disposeByScope()', () => {
    test('disposes all agents in scope', async () => {
      const scope = 'test-scope-123';

      // Create agents with same scope
      await registry.create({ lifespan: 'turn', name: 'agent-1' });
      await registry.create({
        lifespan: 'session',
        name: 'agent-2',
        sessionId: scope,
      });

      // Create agent with different scope
      await registry.create({
        lifespan: 'session',
        name: 'agent-3',
        sessionId: 'other-scope',
      });

      const disposed = await registry.disposeByScope(scope);

      // Should dispose session agent with matching scope
      expect(disposed).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // Listing Tests
  // ===========================================================================

  describe('list()', () => {
    test('lists all agents', async () => {
      await registry.create({ lifespan: 'turn', name: 'agent-1' });
      await registry.create({ lifespan: 'turn', name: 'agent-2' });

      const agents = await registry.list();

      expect(agents.length).toBe(2);
    });

    test('filters by lifespan', async () => {
      await registry.create({ lifespan: 'turn', name: 'turn-agent' });
      await registry.create({ lifespan: 'context', name: 'context-agent' });

      const turnAgents = await registry.list({ lifespan: 'turn' });

      expect(turnAgents.length).toBe(1);
      expect(turnAgents[0].name).toBe('turn-agent');
    });

    test('filters by name', async () => {
      await registry.create({ lifespan: 'turn', name: 'shadow-advisor' });
      await registry.create({ lifespan: 'turn', name: 'helper' });

      const shadows = await registry.list({ name: 'shadow-advisor' });

      expect(shadows.length).toBe(1);
    });
  });

  // ===========================================================================
  // Workflow Tests
  // ===========================================================================

  describe('workflow operations', () => {
    test('startWorkflow creates workflow agent', async () => {
      const agent = await registry.startWorkflow({
        lifespan: 'workflow',
        workflowId: 'FEAT-001',
        name: 'executor',
        workflowType: 'story',
      });

      expect(agent.lifespan).toBe('workflow');
      expect(agent.scope).toBe('FEAT-001');
    });

    test('completeWorkflow disposes all workflow agents', async () => {
      // Create multiple agents for same workflow
      await registry.startWorkflow({
        lifespan: 'workflow',
        workflowId: 'FEAT-002',
        name: 'executor',
      });
      await registry.startWorkflow({
        lifespan: 'workflow',
        workflowId: 'FEAT-002',
        name: 'helper',
      });

      // Create agent for different workflow
      await registry.startWorkflow({
        lifespan: 'workflow',
        workflowId: 'FEAT-003',
        name: 'other',
      });

      const disposed = await registry.completeWorkflow('FEAT-002');

      expect(disposed).toBe(2);

      // Other workflow agent should remain
      const remaining = await registry.getWorkflowAgents('FEAT-003');
      expect(remaining.length).toBe(1);
    });

    test('getWorkflowAgents returns agents for workflow', async () => {
      await registry.startWorkflow({
        lifespan: 'workflow',
        workflowId: 'FEAT-004',
        name: 'agent-1',
      });
      await registry.startWorkflow({
        lifespan: 'workflow',
        workflowId: 'FEAT-004',
        name: 'agent-2',
      });

      const agents = await registry.getWorkflowAgents('FEAT-004');

      expect(agents.length).toBe(2);
    });
  });
});
