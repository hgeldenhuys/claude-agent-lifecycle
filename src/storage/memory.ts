/**
 * In-Memory Storage Backend
 *
 * Used for turn-scoped and context-scoped agents that don't need
 * persistence across process restarts.
 */

import type {
  AgentStorage,
  RegisteredAgent,
  AgentFilter,
} from '../types';

/**
 * In-memory storage implementation using a Map
 */
export class MemoryStorage implements AgentStorage {
  private agents: Map<string, RegisteredAgent> = new Map();
  private nameIndex: Map<string, string> = new Map(); // "name:scope" -> agentId

  private getNameKey(name: string, scope: string): string {
    return `${name}:${scope}`;
  }

  async save(agent: RegisteredAgent): Promise<void> {
    this.agents.set(agent.agentId, agent);
    this.nameIndex.set(this.getNameKey(agent.name, agent.scope), agent.agentId);
  }

  async load(agentId: string): Promise<RegisteredAgent | null> {
    return this.agents.get(agentId) ?? null;
  }

  async findByNameAndScope(name: string, scope: string): Promise<RegisteredAgent | null> {
    const agentId = this.nameIndex.get(this.getNameKey(name, scope));
    if (!agentId) return null;
    return this.agents.get(agentId) ?? null;
  }

  async delete(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.nameIndex.delete(this.getNameKey(agent.name, agent.scope));
      this.agents.delete(agentId);
    }
  }

  async deleteMany(filter: AgentFilter): Promise<number> {
    let deleted = 0;
    const toDelete: string[] = [];

    for (const agent of this.agents.values()) {
      if (this.matchesFilter(agent, filter)) {
        toDelete.push(agent.agentId);
      }
    }

    for (const agentId of toDelete) {
      await this.delete(agentId);
      deleted++;
    }

    return deleted;
  }

  async list(filter?: AgentFilter): Promise<RegisteredAgent[]> {
    const results: RegisteredAgent[] = [];

    for (const agent of this.agents.values()) {
      if (!filter || this.matchesFilter(agent, filter)) {
        results.push(agent);
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

  /**
   * Clear all agents (useful for testing)
   */
  clear(): void {
    this.agents.clear();
    this.nameIndex.clear();
  }

  /**
   * Get count of stored agents
   */
  get size(): number {
    return this.agents.size;
  }
}

/**
 * Singleton instance for global memory storage
 */
let globalMemoryStorage: MemoryStorage | null = null;

export function getMemoryStorage(): MemoryStorage {
  if (!globalMemoryStorage) {
    globalMemoryStorage = new MemoryStorage();
  }
  return globalMemoryStorage;
}

/**
 * Reset global memory storage (for testing)
 */
export function resetMemoryStorage(): void {
  globalMemoryStorage = null;
}
