# Agent Lifecycle Hooks

This directory contains hooks for automatic agent lifecycle management using `claude-hooks-sdk`.

## Overview

The lifecycle manager hook automatically disposes agents at appropriate lifecycle events:

| Event | Disposes | Reason |
|-------|----------|--------|
| Stop | Turn-scoped agents | Response cycle complete |
| SessionEnd | Session-scoped agents | Session terminated |

## Configuration

### Default Mode (Silent)

By default, hooks operate silently with no logging output:

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "bun \"$CLAUDE_PROJECT_DIR\"/.agent/hooks/lifecycle-manager.ts"
      }]
    }],
    "SessionEnd": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "bun \"$CLAUDE_PROJECT_DIR\"/.agent/hooks/lifecycle-manager.ts"
      }]
    }]
  }
}
```

### Debug Mode

Enable debug logging for troubleshooting:

**Option 1: Environment Variable**
```bash
export AGENT_LIFECYCLE_DEBUG=true
```

**Option 2: Command Flag**
```json
{
  "hooks": {
    "Stop": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "bun \"$CLAUDE_PROJECT_DIR\"/.agent/hooks/lifecycle-manager.ts --debug"
      }]
    }]
  }
}
```

**Option 3: Per-Session**
```bash
AGENT_LIFECYCLE_DEBUG=true claude
```

### Log Output

When debug mode is enabled:

**Console Output:**
```
[agent-lifecycle] SessionStart: abc-123 (source: new)
[agent-lifecycle] Active agents: shadow-advisor(session), helper(turn)
[agent-lifecycle] Stop: Disposed 1 turn-scoped agents
[agent-lifecycle] SessionEnd: Disposed 2 agents for session abc-123
```

**File Output (JSON Lines):**
```json
{"event":"agent:created","timestamp":"2025-01-01T00:00:00Z","agentId":"uuid","agentName":"shadow","lifespan":"session","scope":"abc-123"}
{"event":"agent:disposed","timestamp":"2025-01-01T00:05:00Z","agentId":"uuid","agentName":"shadow","lifespan":"session","scope":"abc-123"}
```

Log file location: `.agent/agents/lifecycle.log`

## Hook Events Reference

### Stop

Triggered after each assistant response completes.

**Automatic Actions:**
- Dispose all turn-scoped agents

**Manual Use:**
```bash
# Manually trigger turn cleanup
bun .agent/hooks/lifecycle-manager.ts --event=stop
```

### SessionEnd

Triggered when a Claude Code session terminates.

**Automatic Actions:**
- Dispose all agents scoped to the ending session
- Includes: turn, context, and session-scoped agents

**Manual Use:**
```bash
# Manually trigger session cleanup
bun .agent/hooks/lifecycle-manager.ts --event=session-end --session-id=abc-123
```

## Troubleshooting

### Agents Not Being Disposed

1. Verify hooks are wired in `.claude/settings.json`
2. Check hook script is executable: `chmod +x .agent/hooks/lifecycle-manager.ts`
3. Enable debug mode to see what's happening
4. Check for errors in lifecycle.log

### Debug Log Not Appearing

1. Verify `AGENT_LIFECYCLE_DEBUG=true` is set
2. Check write permissions on `.agent/agents/` directory
3. Ensure hook is actually being triggered (check Claude Code logs)

### Hook Errors

Common errors and solutions:

**"Module not found: claude-hooks-sdk"**
```bash
bun add claude-hooks-sdk
```

**"Permission denied"**
```bash
chmod +x .agent/hooks/lifecycle-manager.ts
```

**"Directory does not exist"**
```bash
mkdir -p .agent/agents
```

## Custom Hooks

You can create custom hooks that integrate with the lifecycle system:

```typescript
import { AgentRegistry } from '@anthropic/claude-agent-lifecycle';

const registry = new AgentRegistry();

// Custom disposal logic
async function onMyCustomEvent() {
  // Dispose workflow agents for a specific workflow
  await registry.completeWorkflow('FEAT-001');

  // Or dispose all agents matching a filter
  await registry.disposeByScope('my-custom-scope');
}
```
