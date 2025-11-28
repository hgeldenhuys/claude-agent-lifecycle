/**
 * Path utilities for agent storage
 */

import { join } from 'path';

/**
 * Default storage base path
 */
export const DEFAULT_STORAGE_PATH = '.agent/agents';

/**
 * Default log path
 */
export const DEFAULT_LOG_PATH = '.agent/agents/lifecycle.log';

/**
 * Get the storage path for a specific lifespan
 */
export function getLifespanPath(basePath: string, lifespan: string): string {
  return join(basePath, lifespan);
}

/**
 * Get the agent file path
 */
export function getAgentPath(
  basePath: string,
  lifespan: string,
  scope: string,
  name: string
): string {
  switch (lifespan) {
    case 'session':
      return join(basePath, 'session', scope, `${name}.json`);
    case 'workflow':
      return join(basePath, 'workflow', scope, `${name}.json`);
    case 'project':
      return join(basePath, 'project', `${name}.json`);
    default:
      throw new Error(`No file path for lifespan: ${lifespan}`);
  }
}

/**
 * Resolve storage path relative to project root
 */
export function resolveStoragePath(basePath?: string): string {
  return basePath ?? DEFAULT_STORAGE_PATH;
}
