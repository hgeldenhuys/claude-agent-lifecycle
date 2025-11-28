/**
 * Agent Registry
 *
 * Central registry for creating, resuming, and disposing agents
 * with different lifespans.
 */

import { randomUUID } from 'crypto';
import type {
  AgentLifespan,
  AgentConfig,
  SessionAgentConfig,
  WorkflowAgentConfig,
  ProjectAgentConfig,
  AnyAgentConfig,
  RegisteredAgent,
  AgentStorage,
  AgentFilter,
  RegistryOptions,
  CreateResult,
  AgentModel,
} from './types';
import { AgentNotFoundError, InvalidConfigError } from './types';
import { MemoryStorage, getMemoryStorage } from './storage/memory';
import { FileStorage, createFileStorages } from './storage/file';
import { getLogger, LifecycleLogger } from './utils/logger';
import { DEFAULT_STORAGE_PATH } from './utils/paths';

/**
 * Agent Registry - manages agent lifecycle
 */
export class AgentRegistry {
  private memoryStorage: MemoryStorage;
  private fileStorages: Record<string, FileStorage>;
  private logger: LifecycleLogger;
  private storagePath: string;

  constructor(options: RegistryOptions = {}) {
    this.storagePath = options.storagePath ?? DEFAULT_STORAGE_PATH;
    this.memoryStorage = getMemoryStorage();
    this.fileStorages = createFileStorages(this.storagePath);
    this.logger = getLogger({
      debug: options.debug,
      logPath: options.debug ? `${this.storagePath}/lifecycle.log` : undefined,
    });
  }

  /**
   * Get storage backend for a lifespan type
   */
  private getStorage(lifespan: AgentLifespan): AgentStorage {
    switch (lifespan) {
      case 'ephemeral':
      case 'turn':
      case 'context':
        return this.memoryStorage;
      case 'session':
      case 'workflow':
      case 'project':
        return this.fileStorages[lifespan];
      default:
        throw new InvalidConfigError(`Unknown lifespan: ${lifespan}`, { lifespan });
    }
  }

  /**
   * Determine scope from config
   */
  private getScope(config: AnyAgentConfig): string {
    switch (config.lifespan) {
      case 'ephemeral':
        return 'ephemeral';
      case 'turn':
        return process.env.CLAUDE_SESSION_ID ?? 'turn';
      case 'context':
        return process.env.CLAUDE_SESSION_ID ?? 'context';
      case 'session':
        return (config as SessionAgentConfig).sessionId ??
               process.env.CLAUDE_SESSION_ID ??
               'unknown-session';
      case 'workflow':
        return (config as WorkflowAgentConfig).workflowId;
      case 'project':
        return (config as ProjectAgentConfig).projectPath ??
               process.cwd();
      default:
        return 'unknown';
    }
  }

  /**
   * Create a new agent or return existing one
   *
   * @returns CreateResult with agent and whether it was newly created
   */
  async create(config: AnyAgentConfig): Promise<CreateResult> {
    // Validate config
    this.validateConfig(config);

    const scope = this.getScope(config);
    const storage = this.getStorage(config.lifespan);

    // Check for existing agent with same name and scope
    const existing = await storage.findByNameAndScope(config.name, scope);
    if (existing) {
      // Update lastUsedAt
      existing.lastUsedAt = new Date().toISOString();
      await storage.save(existing);

      this.logger.agentResumed(existing.agentId, existing.name, existing.lifespan, existing.scope);

      return { agent: existing, isNew: false };
    }

    // Create new agent
    const agent: RegisteredAgent = {
      agentId: randomUUID(),
      name: config.name,
      lifespan: config.lifespan,
      scope,
      model: config.model ?? 'haiku',
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      turnCount: 0,
      metadata: config.metadata ?? {},
    };

    // Store workflow-specific metadata
    if (config.lifespan === 'workflow') {
      agent.metadata.workflowType = (config as WorkflowAgentConfig).workflowType;
    }

    await storage.save(agent);
    this.logger.agentCreated(agent.agentId, agent.name, agent.lifespan, agent.scope);

    return { agent, isNew: true };
  }

  /**
   * Resume an existing agent by name
   *
   * @throws AgentNotFoundError if agent doesn't exist
   */
  async resume(name: string, scope?: string): Promise<RegisteredAgent> {
    // Try each storage to find the agent
    const storages: [AgentLifespan, AgentStorage][] = [
      ['turn', this.memoryStorage],
      ['context', this.memoryStorage],
      ['session', this.fileStorages.session],
      ['workflow', this.fileStorages.workflow],
      ['project', this.fileStorages.project],
    ];

    for (const [lifespan, storage] of storages) {
      // Determine scope to search
      const searchScope = scope ?? this.getDefaultScope(lifespan);
      const agent = await storage.findByNameAndScope(name, searchScope);

      if (agent) {
        // Update lastUsedAt and turnCount
        agent.lastUsedAt = new Date().toISOString();
        agent.turnCount++;
        await storage.save(agent);

        this.logger.agentResumed(agent.agentId, agent.name, agent.lifespan, agent.scope);
        return agent;
      }
    }

    throw new AgentNotFoundError(name, 'name');
  }

  /**
   * Get an agent by ID
   */
  async get(agentId: string): Promise<RegisteredAgent | null> {
    // Search all storages
    let agent = await this.memoryStorage.load(agentId);
    if (agent) return agent;

    for (const storage of Object.values(this.fileStorages)) {
      agent = await storage.load(agentId);
      if (agent) return agent;
    }

    return null;
  }

  /**
   * Dispose (delete) an agent by ID
   */
  async dispose(agentId: string): Promise<void> {
    const agent = await this.get(agentId);
    if (!agent) return;

    const storage = this.getStorage(agent.lifespan);
    await storage.delete(agentId);

    this.logger.agentDisposed(agentId, agent.name, agent.lifespan, agent.scope);
  }

  /**
   * Dispose all agents with a specific lifespan
   */
  async disposeByLifespan(lifespan: AgentLifespan): Promise<number> {
    const storage = this.getStorage(lifespan);
    const count = await storage.deleteMany({ lifespan });

    this.logger.lifecycleCleanup(lifespan, count);
    return count;
  }

  /**
   * Dispose all agents with a specific scope (e.g., session cleanup)
   */
  async disposeByScope(scope: string): Promise<number> {
    let totalDisposed = 0;

    // Check memory storage
    totalDisposed += await this.memoryStorage.deleteMany({ scope });

    // Check file storages
    for (const storage of Object.values(this.fileStorages)) {
      totalDisposed += await storage.deleteMany({ scope });
    }

    this.logger.lifecycleCleanup(`scope:${scope}`, totalDisposed);
    return totalDisposed;
  }

  /**
   * List all agents matching a filter
   */
  async list(filter?: AgentFilter): Promise<RegisteredAgent[]> {
    const results: RegisteredAgent[] = [];

    // Get from memory
    results.push(...await this.memoryStorage.list(filter));

    // Get from file storages
    for (const storage of Object.values(this.fileStorages)) {
      results.push(...await storage.list(filter));
    }

    return results;
  }

  // ==========================================================================
  // Workflow-specific methods
  // ==========================================================================

  /**
   * Start a workflow-scoped agent
   */
  async startWorkflow(config: WorkflowAgentConfig): Promise<RegisteredAgent> {
    const result = await this.create(config);

    if (result.isNew) {
      this.logger.workflowStarted(config.workflowId, result.agent.agentId, config.name);
    }

    return result.agent;
  }

  /**
   * Complete a workflow and dispose its agents
   */
  async completeWorkflow(workflowId: string): Promise<number> {
    const disposed = await this.fileStorages.workflow.deleteMany({ scope: workflowId });
    this.logger.workflowCompleted(workflowId);
    return disposed;
  }

  /**
   * Get agents for a specific workflow
   */
  async getWorkflowAgents(workflowId: string): Promise<RegisteredAgent[]> {
    return this.fileStorages.workflow.list({ scope: workflowId });
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  private validateConfig(config: AnyAgentConfig): void {
    if (!config.name) {
      throw new InvalidConfigError('Agent name is required', config);
    }

    if (!config.lifespan) {
      throw new InvalidConfigError('Agent lifespan is required', config);
    }

    if (config.lifespan === 'workflow') {
      const wfConfig = config as WorkflowAgentConfig;
      if (!wfConfig.workflowId) {
        throw new InvalidConfigError('workflowId is required for workflow-scoped agents', config);
      }
    }
  }

  private getDefaultScope(lifespan: AgentLifespan): string {
    switch (lifespan) {
      case 'ephemeral':
        return 'ephemeral';
      case 'turn':
        return process.env.CLAUDE_SESSION_ID ?? 'turn';
      case 'context':
        return process.env.CLAUDE_SESSION_ID ?? 'context';
      case 'session':
        return process.env.CLAUDE_SESSION_ID ?? 'unknown-session';
      case 'workflow':
        return ''; // Must be provided explicitly
      case 'project':
        return process.cwd();
      default:
        return 'unknown';
    }
  }
}

/**
 * Global registry instance
 */
let globalRegistry: AgentRegistry | null = null;

/**
 * Get the global registry instance
 */
export function getRegistry(options?: RegistryOptions): AgentRegistry {
  if (!globalRegistry || options) {
    globalRegistry = new AgentRegistry(options);
  }
  return globalRegistry;
}

/**
 * Reset global registry (for testing)
 */
export function resetRegistry(): void {
  globalRegistry = null;
}
