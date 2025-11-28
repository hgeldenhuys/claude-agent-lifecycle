/**
 * Debug/Trace Logger
 *
 * Opt-in logging for agent lifecycle events.
 * Disabled by default, enabled via:
 *   - Environment variable: AGENT_LIFECYCLE_DEBUG=true
 *   - Config option: { debug: true }
 *
 * When enabled, logs to:
 *   - Console (if debug=true)
 *   - File (if logPath specified)
 */

import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { dirname } from 'path';
import type { LifecycleEvent, LifecycleEventPayload } from '../types';

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Enable debug logging */
  debug?: boolean;

  /** Path to write log file */
  logPath?: string;

  /** Log format: 'json' or 'text' */
  format?: 'json' | 'text';

  /** Include timestamps */
  timestamps?: boolean;

  /** Custom prefix for log messages */
  prefix?: string;
}

/**
 * Agent Lifecycle Logger
 */
export class LifecycleLogger {
  private debug: boolean;
  private logPath?: string;
  private format: 'json' | 'text';
  private prefix: string;

  constructor(config: LoggerConfig = {}) {
    // Check environment variable first, then config
    this.debug = process.env.AGENT_LIFECYCLE_DEBUG === 'true' || config.debug === true;
    this.logPath = config.logPath;
    this.format = config.format ?? 'json';
    this.prefix = config.prefix ?? '[agent-lifecycle]';

    // Ensure log directory exists
    if (this.logPath) {
      const dir = dirname(this.logPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Check if logging is enabled
   */
  isEnabled(): boolean {
    return this.debug;
  }

  /**
   * Log a lifecycle event
   */
  log(event: LifecycleEvent, data?: Partial<LifecycleEventPayload>): void {
    if (!this.debug) return;

    const payload: LifecycleEventPayload = {
      event,
      timestamp: new Date().toISOString(),
      ...data,
    };

    // Console output
    this.logToConsole(payload);

    // File output
    if (this.logPath) {
      this.logToFile(payload);
    }
  }

  /**
   * Log agent creation
   */
  agentCreated(agentId: string, name: string, lifespan: string, scope: string): void {
    this.log('agent:created', { agentId, agentName: name, lifespan: lifespan as any, scope });
  }

  /**
   * Log agent resumption
   */
  agentResumed(agentId: string, name: string, lifespan: string, scope: string): void {
    this.log('agent:resumed', { agentId, agentName: name, lifespan: lifespan as any, scope });
  }

  /**
   * Log agent disposal
   */
  agentDisposed(agentId: string, name: string, lifespan: string, scope: string): void {
    this.log('agent:disposed', { agentId, agentName: name, lifespan: lifespan as any, scope });
  }

  /**
   * Log workflow start
   */
  workflowStarted(workflowId: string, agentId: string, name: string): void {
    this.log('workflow:started', {
      agentId,
      agentName: name,
      metadata: { workflowId },
    });
  }

  /**
   * Log workflow completion
   */
  workflowCompleted(workflowId: string): void {
    this.log('workflow:completed', {
      metadata: { workflowId },
    });
  }

  /**
   * Log lifecycle cleanup
   */
  lifecycleCleanup(lifespan: string, count: number): void {
    this.log('lifecycle:cleanup', {
      lifespan: lifespan as any,
      metadata: { disposedCount: count },
    });
  }

  private logToConsole(payload: LifecycleEventPayload): void {
    if (this.format === 'json') {
      console.log(JSON.stringify(payload));
    } else {
      const parts = [
        this.prefix,
        payload.timestamp,
        payload.event,
      ];

      if (payload.agentName) {
        parts.push(`agent=${payload.agentName}`);
      }
      if (payload.lifespan) {
        parts.push(`lifespan=${payload.lifespan}`);
      }
      if (payload.scope) {
        parts.push(`scope=${payload.scope}`);
      }

      console.log(parts.join(' '));
    }
  }

  private logToFile(payload: LifecycleEventPayload): void {
    if (!this.logPath) return;

    const line = JSON.stringify(payload) + '\n';
    appendFileSync(this.logPath, line);
  }
}

/**
 * Global logger instance
 */
let globalLogger: LifecycleLogger | null = null;

/**
 * Get or create the global logger
 */
export function getLogger(config?: LoggerConfig): LifecycleLogger {
  if (!globalLogger || config) {
    globalLogger = new LifecycleLogger(config);
  }
  return globalLogger;
}

/**
 * Reset global logger (for testing)
 */
export function resetLogger(): void {
  globalLogger = null;
}

/**
 * Quick check if debug is enabled
 */
export function isDebugEnabled(): boolean {
  return process.env.AGENT_LIFECYCLE_DEBUG === 'true';
}
