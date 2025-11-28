/**
 * Agent Lifecycle Types
 *
 * Defines the core types for managing persistent agents with different lifespans.
 */

// =============================================================================
// Lifespan Types
// =============================================================================

/**
 * Agent lifespan determines when an agent is automatically disposed.
 *
 * | Type      | Survives          | Disposed By              | Use Case                    |
 * |-----------|-------------------|--------------------------|------------------------------|
 * | ephemeral | Nothing           | Immediately              | One-shot tasks               |
 * | turn      | Single turn       | Stop hook                | Multi-step within response   |
 * | context   | Multiple turns    | Compaction/manual        | Working memory               |
 * | session   | Full session      | SessionEnd hook          | Knowledge advisors           |
 * | workflow  | Explicit bounds   | completeWorkflow()       | Feature implementation       |
 * | project   | Indefinite        | Manual only              | Architecture advisor         |
 */
export type AgentLifespan =
  | 'ephemeral'   // No persistence - fire and forget
  | 'turn'        // Until Stop event
  | 'context'     // Until compaction
  | 'session'     // Until SessionEnd
  | 'workflow'    // Until explicit completion
  | 'project';    // Never auto-disposed

/**
 * Model selection for agents
 */
export type AgentModel = 'haiku' | 'sonnet' | 'opus';

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Base configuration for creating an agent
 */
export interface AgentConfig {
  /** Lifespan determines automatic disposal timing */
  lifespan: AgentLifespan;

  /** Human-readable name for the agent (e.g., "shadow-advisor") */
  name: string;

  /** Model to use (haiku is recommended for knowledge retrieval) */
  model?: AgentModel;

  /** Files to preload into agent context on creation */
  preload?: string[];

  /** Initial prompt/instructions for the agent */
  systemPrompt?: string;

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for session-scoped agents
 */
export interface SessionAgentConfig extends AgentConfig {
  lifespan: 'session';

  /** Session ID to scope the agent to (defaults to current session) */
  sessionId?: string;
}

/**
 * Configuration for workflow-scoped agents
 */
export interface WorkflowAgentConfig extends AgentConfig {
  lifespan: 'workflow';

  /** Unique workflow identifier (e.g., "FEAT-001", "PRD-005") */
  workflowId: string;

  /** Optional workflow type hint (e.g., "loom-story", "prd", "migration") */
  workflowType?: string;
}

/**
 * Configuration for project-scoped agents
 */
export interface ProjectAgentConfig extends AgentConfig {
  lifespan: 'project';

  /** Project path (defaults to current working directory) */
  projectPath?: string;
}

/**
 * Union type for all agent configurations
 */
export type AnyAgentConfig =
  | AgentConfig
  | SessionAgentConfig
  | WorkflowAgentConfig
  | ProjectAgentConfig;

// =============================================================================
// Registered Agent Types
// =============================================================================

/**
 * A registered agent with full state information
 */
export interface RegisteredAgent {
  /** Claude-assigned agent ID (UUID) - used for resumption */
  agentId: string;

  /** Human-readable name */
  name: string;

  /** Agent lifespan type */
  lifespan: AgentLifespan;

  /** Scoping key (sessionId, workflowId, or projectPath) */
  scope: string;

  /** Model used */
  model: AgentModel;

  /** ISO timestamp of creation */
  createdAt: string;

  /** ISO timestamp of last use */
  lastUsedAt: string;

  /** Number of times agent has been used */
  turnCount: number;

  /** Custom metadata */
  metadata: Record<string, unknown>;
}

// =============================================================================
// Storage Types
// =============================================================================

/**
 * Storage interface for agent state persistence
 */
export interface AgentStorage {
  /** Store an agent */
  save(agent: RegisteredAgent): Promise<void>;

  /** Load an agent by ID */
  load(agentId: string): Promise<RegisteredAgent | null>;

  /** Find agent by name and scope */
  findByNameAndScope(name: string, scope: string): Promise<RegisteredAgent | null>;

  /** Delete an agent */
  delete(agentId: string): Promise<void>;

  /** Delete all agents matching a filter */
  deleteMany(filter: AgentFilter): Promise<number>;

  /** List agents matching a filter */
  list(filter?: AgentFilter): Promise<RegisteredAgent[]>;
}

/**
 * Filter for querying agents
 */
export interface AgentFilter {
  lifespan?: AgentLifespan;
  scope?: string;
  name?: string;
}

// =============================================================================
// Registry Types
// =============================================================================

/**
 * Result of creating an agent
 */
export interface CreateResult {
  agent: RegisteredAgent;

  /** Whether this was a new creation or resumed existing */
  isNew: boolean;
}

/**
 * Options for the AgentRegistry
 */
export interface RegistryOptions {
  /** Base path for file storage (default: .agent/agents) */
  storagePath?: string;

  /** Enable debug logging */
  debug?: boolean;

  /** Custom logger function */
  logger?: (message: string, data?: unknown) => void;
}

// =============================================================================
// Hook Types
// =============================================================================

/**
 * Configuration for lifecycle hooks
 */
export interface LifecycleHookConfig {
  /** Enable debug logging for all lifecycle events */
  debug?: boolean;

  /** Path to write lifecycle logs (default: .agent/agents/lifecycle.log) */
  logPath?: string;

  /** Log format: 'json' for machine parsing, 'text' for human reading */
  logFormat?: 'json' | 'text';
}

/**
 * Lifecycle event types
 */
export type LifecycleEvent =
  | 'agent:created'
  | 'agent:resumed'
  | 'agent:disposed'
  | 'agent:updated'
  | 'workflow:started'
  | 'workflow:completed'
  | 'lifecycle:cleanup';

/**
 * Lifecycle event payload
 */
export interface LifecycleEventPayload {
  event: LifecycleEvent;
  timestamp: string;
  agentId?: string;
  agentName?: string;
  lifespan?: AgentLifespan;
  scope?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Base error for agent lifecycle operations
 */
export class AgentLifecycleError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AgentLifecycleError';
  }
}

/**
 * Agent not found error
 */
export class AgentNotFoundError extends AgentLifecycleError {
  constructor(identifier: string, identifierType: 'id' | 'name' = 'id') {
    super(
      `Agent not found: ${identifier}`,
      'AGENT_NOT_FOUND',
      { identifier, identifierType }
    );
    this.name = 'AgentNotFoundError';
  }
}

/**
 * Invalid configuration error
 */
export class InvalidConfigError extends AgentLifecycleError {
  constructor(message: string, config: unknown) {
    super(message, 'INVALID_CONFIG', { config });
    this.name = 'InvalidConfigError';
  }
}

/**
 * Storage error
 */
export class StorageError extends AgentLifecycleError {
  constructor(message: string, operation: string, cause?: Error) {
    super(message, 'STORAGE_ERROR', { operation, cause: cause?.message });
    this.name = 'StorageError';
  }
}
