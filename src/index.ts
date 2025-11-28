/**
 * Claude Agent Lifecycle
 *
 * Persistent agent lifecycle management for Claude Code.
 *
 * @example
 * ```typescript
 * import { AgentRegistry } from '@anthropic/claude-agent-lifecycle';
 *
 * const registry = new AgentRegistry();
 *
 * // Create a session-scoped agent
 * const { agent, isNew } = await registry.create({
 *   lifespan: 'session',
 *   name: 'shadow-advisor',
 *   model: 'haiku',
 * });
 *
 * // Resume later in the session
 * const shadow = await registry.resume('shadow-advisor');
 *
 * // Start a workflow-scoped agent
 * const executor = await registry.startWorkflow({
 *   lifespan: 'workflow',
 *   workflowId: 'FEAT-001',
 *   name: 'story-executor',
 *   model: 'sonnet',
 * });
 *
 * // Complete workflow (disposes all workflow agents)
 * await registry.completeWorkflow('FEAT-001');
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Lifespan
  AgentLifespan,
  AgentModel,

  // Configuration
  AgentConfig,
  SessionAgentConfig,
  WorkflowAgentConfig,
  ProjectAgentConfig,
  AnyAgentConfig,

  // Agent state
  RegisteredAgent,
  CreateResult,

  // Storage
  AgentStorage,
  AgentFilter,

  // Registry
  RegistryOptions,

  // Hooks
  LifecycleHookConfig,
  LifecycleEvent,
  LifecycleEventPayload,
} from './types';

// Errors
export {
  AgentLifecycleError,
  AgentNotFoundError,
  InvalidConfigError,
  StorageError,
} from './types';

// =============================================================================
// Registry
// =============================================================================

export { AgentRegistry, getRegistry, resetRegistry } from './registry';

// =============================================================================
// Storage
// =============================================================================

export {
  MemoryStorage,
  getMemoryStorage,
  resetMemoryStorage,
  FileStorage,
  createFileStorages,
} from './storage';

// =============================================================================
// Utilities
// =============================================================================

export {
  LifecycleLogger,
  getLogger,
  resetLogger,
  isDebugEnabled,
} from './utils/logger';

export {
  DEFAULT_STORAGE_PATH,
  DEFAULT_LOG_PATH,
  getLifespanPath,
  getAgentPath,
  resolveStoragePath,
} from './utils/paths';

// =============================================================================
// Convenience Functions
// =============================================================================

import { AgentRegistry } from './registry';
import type { AnyAgentConfig, RegisteredAgent, WorkflowAgentConfig } from './types';

/**
 * Quick create: Create or resume an agent
 */
export async function createAgent(config: AnyAgentConfig): Promise<RegisteredAgent> {
  const registry = new AgentRegistry();
  const { agent } = await registry.create(config);
  return agent;
}

/**
 * Quick resume: Resume an agent by name
 */
export async function resumeAgent(name: string, scope?: string): Promise<RegisteredAgent> {
  const registry = new AgentRegistry();
  return registry.resume(name, scope);
}

/**
 * Quick workflow: Start a workflow-scoped agent
 */
export async function startWorkflow(
  workflowId: string,
  name: string,
  options?: Partial<Omit<WorkflowAgentConfig, 'lifespan' | 'workflowId' | 'name'>>
): Promise<RegisteredAgent> {
  const registry = new AgentRegistry();
  return registry.startWorkflow({
    lifespan: 'workflow',
    workflowId,
    name,
    ...options,
  });
}

/**
 * Quick complete: Complete a workflow and dispose agents
 */
export async function completeWorkflow(workflowId: string): Promise<number> {
  const registry = new AgentRegistry();
  return registry.completeWorkflow(workflowId);
}
