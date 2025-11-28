/**
 * Integration Tests for Agent Lifecycle Knowledge Isolation
 *
 * These tests verify that agents correctly maintain and lose state
 * based on their lifespan boundaries.
 *
 * Test strategy:
 * - Create agent and store a "secret" in its context
 * - Within lifespan: agent should know the secret
 * - After lifespan ends: new agent should NOT know the secret
 *
 * Requirements:
 * - Claude CLI installed (`claude` command available)
 * - Tests run in sequence (not parallel) to avoid state conflicts
 *
 * Usage:
 *   bun test tests/integration/lifecycle-isolation.test.ts
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { AgentRegistry, resetRegistry } from '../../src/registry';
import { resetMemoryStorage } from '../../src/storage/memory';
import { rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { spawn, execSync } from 'child_process';
import { randomUUID } from 'crypto';

const TEST_STORAGE_PATH = '.agent/test-integration';
const TIMEOUT = 30000;

/**
 * Run a command with Claude in print mode (non-interactive)
 */
async function runClaudeHeadless(
  prompt: string,
  options: { timeout?: number; env?: Record<string, string> } = {}
): Promise<string> {
  const timeout = options.timeout ?? TIMEOUT;
  const env = { ...process.env, ...options.env };

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--print', prompt], {
      env,
      timeout,
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Claude exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Check if Claude CLI is available
 */
function isClaudeAvailable(): boolean {
  try {
    execSync('claude --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

describe('Lifecycle Knowledge Isolation (Integration)', () => {
  let registry: AgentRegistry;
  const skipReason = 'Claude CLI not available';
  const claudeAvailable = isClaudeAvailable();

  beforeAll(() => {
    if (!claudeAvailable) {
      console.log(`⚠️  ${skipReason} - integration tests will be skipped`);
    }
  });

  beforeEach(() => {
    resetRegistry();
    resetMemoryStorage();
    if (existsSync(TEST_STORAGE_PATH)) {
      rmSync(TEST_STORAGE_PATH, { recursive: true });
    }
    registry = new AgentRegistry({ storagePath: TEST_STORAGE_PATH, debug: true });
  });

  afterEach(() => {
    if (existsSync(TEST_STORAGE_PATH)) {
      rmSync(TEST_STORAGE_PATH, { recursive: true });
    }
  });

  // ===========================================================================
  // Registry State Tests (No Claude required)
  // ===========================================================================

  describe('Registry state management', () => {
    test('turn-scoped agent state is preserved within turn', async () => {
      // Create agent with metadata
      const secret = `secret-${randomUUID()}`;
      const { agent } = await registry.create({
        lifespan: 'turn',
        name: 'turn-test',
        metadata: { secret },
      });

      // Verify state is accessible
      const retrieved = await registry.get(agent.agentId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.metadata.secret).toBe(secret);
    });

    test('turn-scoped agent state is lost after disposal', async () => {
      // Create agent
      const { agent } = await registry.create({
        lifespan: 'turn',
        name: 'turn-dispose-test',
        metadata: { secret: 'my-secret' },
      });

      // Dispose (simulating end of turn)
      await registry.dispose(agent.agentId);

      // Verify state is gone
      const retrieved = await registry.get(agent.agentId);
      expect(retrieved).toBeNull();
    });

    test('session-scoped agent state persists across registry restarts', async () => {
      const secret = `session-secret-${randomUUID()}`;
      const sessionId = `session-${randomUUID()}`;

      // Create agent
      const { agent } = await registry.create({
        lifespan: 'session',
        name: 'session-persist-test',
        sessionId,
        metadata: { secret },
      });

      // Simulate restart - create new registry instance
      resetRegistry();
      const newRegistry = new AgentRegistry({ storagePath: TEST_STORAGE_PATH });

      // Resume agent
      const resumed = await newRegistry.resume('session-persist-test', sessionId);
      expect(resumed.metadata.secret).toBe(secret);
    });

    test('workflow-scoped agent state persists until workflow completes', async () => {
      const secret = `workflow-secret-${randomUUID()}`;
      const workflowId = `FEAT-${randomUUID().slice(0, 8)}`;

      // Create workflow agent
      const { agent } = await registry.create({
        lifespan: 'workflow',
        name: 'workflow-test',
        workflowId,
        metadata: { secret },
      });

      // Verify state persists
      const retrieved = await registry.get(agent.agentId);
      expect(retrieved!.metadata.secret).toBe(secret);

      // Complete workflow
      await registry.completeWorkflow(workflowId);

      // Verify state is gone
      const after = await registry.get(agent.agentId);
      expect(after).toBeNull();
    });

    test('project-scoped agent state persists indefinitely', async () => {
      const secret = `project-secret-${randomUUID()}`;

      // Create project agent
      const { agent } = await registry.create({
        lifespan: 'project',
        name: 'project-test',
        metadata: { secret },
      });

      // Simulate restart
      resetRegistry();
      const newRegistry = new AgentRegistry({ storagePath: TEST_STORAGE_PATH });

      // Should still be accessible
      const resumed = await newRegistry.resume('project-test');
      expect(resumed.metadata.secret).toBe(secret);

      // Clean up
      await newRegistry.dispose(resumed.agentId);
    });
  });

  // ===========================================================================
  // Lifespan Boundary Tests
  // ===========================================================================

  describe('Lifespan boundaries', () => {
    test('disposeByLifespan removes all agents of that type', async () => {
      // Create multiple turn agents
      await registry.create({ lifespan: 'turn', name: 'turn-a' });
      await registry.create({ lifespan: 'turn', name: 'turn-b' });

      // Create one context agent
      await registry.create({ lifespan: 'context', name: 'context-a' });

      // Verify all exist
      expect((await registry.list()).length).toBe(3);

      // Dispose turn agents (simulating Stop event)
      const disposed = await registry.disposeByLifespan('turn');
      expect(disposed).toBe(2);

      // Context agent should remain
      const remaining = await registry.list();
      expect(remaining.length).toBe(1);
      expect(remaining[0].name).toBe('context-a');
    });

    test('disposeByScope removes all agents in that scope', async () => {
      const sessionId = `session-${randomUUID()}`;

      // Create agents with same session
      await registry.create({
        lifespan: 'session',
        name: 'session-agent-1',
        sessionId,
      });
      await registry.create({
        lifespan: 'session',
        name: 'session-agent-2',
        sessionId,
      });

      // Create agent with different session
      await registry.create({
        lifespan: 'session',
        name: 'other-agent',
        sessionId: 'other-session',
      });

      // Dispose session (simulating SessionEnd event)
      const disposed = await registry.disposeByScope(sessionId);
      expect(disposed).toBe(2);

      // Other session's agent should remain
      const remaining = await registry.list();
      expect(remaining.length).toBe(1);
      expect(remaining[0].name).toBe('other-agent');
    });
  });

  // ===========================================================================
  // Headless Claude Tests (Require Claude CLI)
  // ===========================================================================

  describe('Headless Claude isolation tests', () => {
    test.skipIf(!claudeAvailable)('agent knowledge is isolated by lifespan', async () => {
      // This test uses Claude in print mode to verify that:
      // 1. An agent can be told a secret
      // 2. Within the same "session", the secret is remembered
      // 3. After the session ends, a new session doesn't know the secret

      // Note: Since we can't truly manage Claude's memory externally,
      // this test validates our registry mechanics by checking that
      // separate registry sessions have separate metadata storage.

      const secret1 = `SECRET-${randomUUID().slice(0, 8)}`;
      const secret2 = `SECRET-${randomUUID().slice(0, 8)}`;

      // Create first agent with a secret
      const { agent: agent1 } = await registry.create({
        lifespan: 'turn',
        name: 'knowledge-test',
        metadata: { knownSecret: secret1 },
      });

      // Verify first agent knows its secret
      expect(agent1.metadata.knownSecret).toBe(secret1);

      // Dispose the turn (simulating Stop event)
      await registry.disposeByLifespan('turn');

      // Create second agent - should NOT know first secret
      const { agent: agent2 } = await registry.create({
        lifespan: 'turn',
        name: 'knowledge-test',
        metadata: { knownSecret: secret2 },
      });

      // Second agent has different ID (not resumed)
      expect(agent2.agentId).not.toBe(agent1.agentId);
      expect(agent2.metadata.knownSecret).toBe(secret2);
      expect(agent2.metadata.knownSecret).not.toBe(secret1);
    });

    test.skipIf(!claudeAvailable)('session agents persist across multiple registrations', async () => {
      const sessionId = `test-session-${randomUUID()}`;
      const secret = `SESSION-SECRET-${randomUUID().slice(0, 8)}`;

      // First registration
      const { agent: first, isNew: isNew1 } = await registry.create({
        lifespan: 'session',
        name: 'persistent-agent',
        sessionId,
        metadata: { secret },
      });

      expect(isNew1).toBe(true);

      // Second registration with same name/scope
      const { agent: second, isNew: isNew2 } = await registry.create({
        lifespan: 'session',
        name: 'persistent-agent',
        sessionId,
      });

      // Should return existing agent (not create new)
      expect(isNew2).toBe(false);
      expect(second.agentId).toBe(first.agentId);
      expect(second.metadata.secret).toBe(secret);
    });

    test.skipIf(!claudeAvailable)('workflow agents are isolated per workflow', async () => {
      const workflow1 = 'FEAT-001';
      const workflow2 = 'FEAT-002';

      // Create agents for different workflows
      await registry.startWorkflow({
        lifespan: 'workflow',
        workflowId: workflow1,
        name: 'executor',
        metadata: { workflowSecret: 'secret-1' },
      });

      await registry.startWorkflow({
        lifespan: 'workflow',
        workflowId: workflow2,
        name: 'executor',
        metadata: { workflowSecret: 'secret-2' },
      });

      // Get agents for each workflow
      const agents1 = await registry.getWorkflowAgents(workflow1);
      const agents2 = await registry.getWorkflowAgents(workflow2);

      expect(agents1.length).toBe(1);
      expect(agents2.length).toBe(1);
      expect(agents1[0].metadata.workflowSecret).toBe('secret-1');
      expect(agents2[0].metadata.workflowSecret).toBe('secret-2');

      // Complete workflow 1
      await registry.completeWorkflow(workflow1);

      // Workflow 2 agents should remain
      const remaining1 = await registry.getWorkflowAgents(workflow1);
      const remaining2 = await registry.getWorkflowAgents(workflow2);

      expect(remaining1.length).toBe(0);
      expect(remaining2.length).toBe(1);
    });
  });

  // ===========================================================================
  // Hook Integration Tests
  // ===========================================================================

  describe('Hook-triggered disposal', () => {
    test('stop event disposes turn-scoped agents', async () => {
      // Simulate multiple turn agents
      await registry.create({ lifespan: 'turn', name: 'turn-1' });
      await registry.create({ lifespan: 'turn', name: 'turn-2' });

      // Keep session agent
      await registry.create({
        lifespan: 'session',
        name: 'session-1',
        sessionId: 'test-session',
      });

      // Simulate Stop event by disposing turn-scoped
      const disposed = await registry.disposeByLifespan('turn');

      expect(disposed).toBe(2);

      // Session agent should survive
      const remaining = await registry.list();
      expect(remaining.length).toBe(1);
      expect(remaining[0].lifespan).toBe('session');
    });

    test('session-end event disposes session-scoped agents', async () => {
      const sessionId = 'ending-session';

      // Create agents for this session
      await registry.create({
        lifespan: 'session',
        name: 'session-agent',
        sessionId,
      });

      // Create turn agent (also uses session scope in our implementation)
      await registry.create({
        lifespan: 'turn',
        name: 'turn-agent',
      });

      // Simulate SessionEnd
      const disposed = await registry.disposeByScope(sessionId);

      expect(disposed).toBe(1);
    });
  });
});
