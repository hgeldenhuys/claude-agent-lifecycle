#!/usr/bin/env bun
/**
 * Agent Lifecycle Manager Hook
 *
 * Manages agent disposal at appropriate lifecycle events using claude-hooks-sdk.
 *
 * Disposal triggers:
 *   - Stop: Disposes turn-scoped agents
 *   - SessionEnd: Disposes session-scoped agents
 *
 * Configuration:
 *   By default, this hook operates silently. Enable debug logging via:
 *   - Environment variable: AGENT_LIFECYCLE_DEBUG=true
 *   - Or pass --debug flag when running
 *
 * Usage:
 *   This hook is automatically wired by the installer. Manual usage:
 *   bun hooks/lifecycle-manager.ts
 *   bun hooks/lifecycle-manager.ts --debug
 */

import { HookManager } from 'claude-hooks-sdk';
import { AgentRegistry } from '../src/registry';
import { getLogger } from '../src/utils/logger';

// Parse debug flag
const isDebugMode = process.argv.includes('--debug') ||
                    process.env.AGENT_LIFECYCLE_DEBUG === 'true';

// Initialize logger
const logger = getLogger({
  debug: isDebugMode,
  logPath: isDebugMode ? '.agent/agents/lifecycle.log' : undefined,
  format: 'json',
});

// Initialize registry
const registry = new AgentRegistry({
  debug: isDebugMode,
});

// Create hook manager
const manager = new HookManager({
  clientId: 'agent-lifecycle',
  logEvents: isDebugMode,
});

/**
 * Stop Event Handler
 *
 * Disposes turn-scoped agents when a response completes.
 */
manager.onStop(async (input) => {
  try {
    const disposed = await registry.disposeByLifespan('turn');

    if (isDebugMode && disposed > 0) {
      console.log(`[agent-lifecycle] Stop: Disposed ${disposed} turn-scoped agents`);
    }
  } catch (error) {
    if (isDebugMode) {
      console.error('[agent-lifecycle] Stop error:', error);
    }
  }
});

/**
 * Session End Event Handler
 *
 * Disposes session-scoped agents when the session ends.
 */
manager.onSessionEnd(async (input) => {
  try {
    const sessionId = input.session_id;

    // Dispose all agents scoped to this session
    const disposed = await registry.disposeByScope(sessionId);

    if (isDebugMode) {
      console.log(`[agent-lifecycle] SessionEnd: Disposed ${disposed} agents for session ${sessionId}`);
    }
  } catch (error) {
    if (isDebugMode) {
      console.error('[agent-lifecycle] SessionEnd error:', error);
    }
  }
});

/**
 * Session Start Event Handler (Debug Only)
 *
 * Logs session start for debugging/tracing purposes.
 */
if (isDebugMode) {
  manager.onSessionStart(async (input) => {
    console.log(`[agent-lifecycle] SessionStart: ${input.session_id} (source: ${input.source})`);

    // List active agents for this session
    const agents = await registry.list();
    if (agents.length > 0) {
      console.log(`[agent-lifecycle] Active agents: ${agents.map(a => `${a.name}(${a.lifespan})`).join(', ')}`);
    }
  });
}

// Run the hook manager
manager.run();
