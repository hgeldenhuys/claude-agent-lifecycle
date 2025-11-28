/**
 * File-Based Storage Backend
 *
 * Used for session-scoped, workflow-scoped, and project-scoped agents
 * that need persistence across process restarts and sessions.
 *
 * Storage structure:
 *   .agent/agents/
 *   ├── session/{sessionId}/{agentName}.json
 *   ├── workflow/{workflowId}/{agentName}.json
 *   └── project/{agentName}.json
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import type {
  AgentStorage,
  RegisteredAgent,
  AgentFilter,
  AgentLifespan,
  StorageError,
} from '../types';

/**
 * File storage configuration
 */
export interface FileStorageConfig {
  /** Base path for storage (default: .agent/agents) */
  basePath: string;

  /** Lifespan type this storage handles */
  lifespan: AgentLifespan;
}

/**
 * File-based storage implementation
 */
export class FileStorage implements AgentStorage {
  private basePath: string;
  private lifespan: AgentLifespan;

  constructor(config: FileStorageConfig) {
    this.basePath = config.basePath;
    this.lifespan = config.lifespan;
    this.ensureBaseDir();
  }

  private ensureBaseDir(): void {
    const dir = join(this.basePath, this.lifespan);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private getAgentPath(agent: RegisteredAgent): string {
    switch (this.lifespan) {
      case 'session':
        return join(this.basePath, 'session', agent.scope, `${agent.name}.json`);
      case 'workflow':
        return join(this.basePath, 'workflow', agent.scope, `${agent.name}.json`);
      case 'project':
        return join(this.basePath, 'project', `${agent.name}.json`);
      default:
        throw new Error(`File storage not supported for lifespan: ${this.lifespan}`);
    }
  }

  private getAgentPathByNameAndScope(name: string, scope: string): string {
    switch (this.lifespan) {
      case 'session':
        return join(this.basePath, 'session', scope, `${name}.json`);
      case 'workflow':
        return join(this.basePath, 'workflow', scope, `${name}.json`);
      case 'project':
        return join(this.basePath, 'project', `${name}.json`);
      default:
        throw new Error(`File storage not supported for lifespan: ${this.lifespan}`);
    }
  }

  async save(agent: RegisteredAgent): Promise<void> {
    const path = this.getAgentPath(agent);
    const dir = dirname(path);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(path, JSON.stringify(agent, null, 2));
  }

  async load(agentId: string): Promise<RegisteredAgent | null> {
    // For file storage, we need to search through files
    // This is less efficient but maintains the interface
    const agents = await this.list();
    return agents.find(a => a.agentId === agentId) ?? null;
  }

  async findByNameAndScope(name: string, scope: string): Promise<RegisteredAgent | null> {
    const path = this.getAgentPathByNameAndScope(name, scope);

    if (!existsSync(path)) {
      return null;
    }

    try {
      const content = readFileSync(path, 'utf-8');
      return JSON.parse(content) as RegisteredAgent;
    } catch {
      return null;
    }
  }

  async delete(agentId: string): Promise<void> {
    const agent = await this.load(agentId);
    if (agent) {
      const path = this.getAgentPath(agent);
      if (existsSync(path)) {
        unlinkSync(path);
      }
    }
  }

  async deleteMany(filter: AgentFilter): Promise<number> {
    const agents = await this.list(filter);
    let deleted = 0;

    for (const agent of agents) {
      const path = this.getAgentPath(agent);
      if (existsSync(path)) {
        unlinkSync(path);
        deleted++;
      }
    }

    // Clean up empty directories
    this.cleanEmptyDirs();

    return deleted;
  }

  async list(filter?: AgentFilter): Promise<RegisteredAgent[]> {
    const results: RegisteredAgent[] = [];
    const lifespanDir = join(this.basePath, this.lifespan);

    if (!existsSync(lifespanDir)) {
      return results;
    }

    if (this.lifespan === 'project') {
      // Project agents are directly in the project folder
      const files = readdirSync(lifespanDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = readFileSync(join(lifespanDir, file), 'utf-8');
          const agent = JSON.parse(content) as RegisteredAgent;
          if (!filter || this.matchesFilter(agent, filter)) {
            results.push(agent);
          }
        } catch {
          // Skip invalid files
        }
      }
    } else {
      // Session and workflow agents are in scope subdirectories
      const scopeDirs = readdirSync(lifespanDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const scope of scopeDirs) {
        const scopePath = join(lifespanDir, scope);
        const files = readdirSync(scopePath).filter(f => f.endsWith('.json'));

        for (const file of files) {
          try {
            const content = readFileSync(join(scopePath, file), 'utf-8');
            const agent = JSON.parse(content) as RegisteredAgent;
            if (!filter || this.matchesFilter(agent, filter)) {
              results.push(agent);
            }
          } catch {
            // Skip invalid files
          }
        }
      }
    }

    return results;
  }

  private matchesFilter(agent: RegisteredAgent, filter: AgentFilter): boolean {
    if (filter.lifespan && agent.lifespan !== filter.lifespan) return false;
    if (filter.scope && agent.scope !== filter.scope) return false;
    if (filter.name && agent.name !== filter.name) return false;
    return true;
  }

  private cleanEmptyDirs(): void {
    const lifespanDir = join(this.basePath, this.lifespan);
    if (!existsSync(lifespanDir)) return;

    if (this.lifespan !== 'project') {
      const scopeDirs = readdirSync(lifespanDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const scope of scopeDirs) {
        const scopePath = join(lifespanDir, scope);
        const files = readdirSync(scopePath);
        if (files.length === 0) {
          rmSync(scopePath, { recursive: true });
        }
      }
    }
  }

  /**
   * Delete all agents for a specific scope (useful for session cleanup)
   */
  async deleteScope(scope: string): Promise<number> {
    return this.deleteMany({ scope });
  }
}

/**
 * Create file storage instances for each persistent lifespan
 */
export function createFileStorages(basePath: string = '.agent/agents'): Record<string, FileStorage> {
  return {
    session: new FileStorage({ basePath, lifespan: 'session' }),
    workflow: new FileStorage({ basePath, lifespan: 'workflow' }),
    project: new FileStorage({ basePath, lifespan: 'project' }),
  };
}
