# Agent Lifecycle Pattern

Use this skill when implementing persistent agents with automatic lifecycle management. This pattern is useful for:
- Creating agents that survive across turns or sessions
- Managing workflow-scoped agents (e.g., story execution, feature development)
- Automatic cleanup of agents at appropriate lifecycle boundaries

---

## When to Use This Skill

- User wants to create persistent agents
- User needs agents scoped to workflows, sessions, or projects
- User wants automatic agent disposal at lifecycle boundaries
- User is building a system with multiple cooperating agents

---

## Quick Start

```typescript
import { AgentRegistry } from 'claude-agent-lifecycle';

const registry = new AgentRegistry();

// Create a session-scoped agent (survives until session ends)
const { agent, isNew } = await registry.create({
  lifespan: 'session',
  name: 'my-advisor',
  model: 'haiku',
  metadata: { role: 'knowledge-retrieval' },
});

// Resume later in the same session
const advisor = await registry.resume('my-advisor');
```

---

## The 6 Lifespans

Choose the appropriate lifespan based on how long the agent should live:

| Lifespan | Scope | Auto-Disposal | Storage | Use Case |
|----------|-------|---------------|---------|----------|
| `ephemeral` | Single use | Immediately | Memory | Fire-and-forget tasks |
| `turn` | Response cycle | Stop event | Memory | Per-request helpers |
| `context` | Until compaction | Context reset | Memory | Multi-turn conversations |
| `session` | Claude session | SessionEnd | File | Knowledge advisors |
| `workflow` | Bounded work | Manual | File | Story/feature execution |
| `project` | Indefinite | Manual | File | Singleton services |

### Decision Tree

```
How long should the agent live?
├── Just this one call? → ephemeral
├── Until response completes? → turn
├── Until context resets? → context
├── Until session ends? → session
├── Until work unit completes? → workflow
└── Forever (until manually disposed)? → project
```

---

## Common Patterns

### Pattern 1: Session-Scoped Advisor

For agents that should persist throughout a Claude Code session:

```typescript
import { AgentRegistry } from 'claude-agent-lifecycle';

async function getAdvisor() {
  const registry = new AgentRegistry();

  const { agent, isNew } = await registry.create({
    lifespan: 'session',
    name: 'shadow-advisor',
    model: 'haiku',
    metadata: {
      role: 'knowledge-retrieval',
      preloadedKnowledge: ['patterns', 'pain-points'],
    },
  });

  if (isNew) {
    // First time - initialize with context
    console.log('Created new advisor');
  } else {
    // Resumed - context already loaded
    console.log(`Resumed advisor (turn ${agent.turnCount})`);
  }

  return agent;
}
```

### Pattern 2: Workflow-Scoped Execution

For agents tied to a unit of work (story, feature, task):

```typescript
import { AgentRegistry } from 'claude-agent-lifecycle';

async function executeStory(storyId: string) {
  const registry = new AgentRegistry();

  // Start the main executor
  const executor = await registry.startWorkflow({
    lifespan: 'workflow',
    workflowId: storyId,
    name: 'executor',
    workflowType: 'story-execution',
    model: 'sonnet',
  });

  // Add specialists as needed
  await registry.startWorkflow({
    lifespan: 'workflow',
    workflowId: storyId,
    name: 'backend-dev',
    model: 'sonnet',
  });

  await registry.startWorkflow({
    lifespan: 'workflow',
    workflowId: storyId,
    name: 'qa',
    model: 'haiku',
  });

  // ... execute work ...

  // Complete workflow (disposes all agents for this storyId)
  await registry.completeWorkflow(storyId);
}
```

### Pattern 3: Turn-Scoped Helper

For short-lived agents that help with a single response:

```typescript
import { AgentRegistry } from 'claude-agent-lifecycle';

async function analyzeCode(code: string) {
  const registry = new AgentRegistry();

  const { agent } = await registry.create({
    lifespan: 'turn',
    name: 'code-analyzer',
    model: 'haiku',
  });

  // Agent automatically disposed when Stop hook fires
  return agent;
}
```

### Pattern 4: Project Singleton

For agents that should persist indefinitely:

```typescript
import { AgentRegistry } from 'claude-agent-lifecycle';

async function getProjectConfig() {
  const registry = new AgentRegistry();

  const { agent, isNew } = await registry.create({
    lifespan: 'project',
    name: 'config-manager',
    model: 'haiku',
  });

  // Only disposed manually
  // await registry.dispose(agent.agentId);

  return agent;
}
```

---

## Hook Integration

Hooks automatically dispose agents at lifecycle boundaries:

### hooks/hooks.json

```json
{
  "Stop": [{
    "hooks": [{
      "type": "command",
      "command": "bun \"${CLAUDE_PLUGIN_ROOT}/hooks/lifecycle-manager.ts\""
    }]
  }],
  "SessionEnd": [{
    "hooks": [{
      "type": "command",
      "command": "bun \"${CLAUDE_PLUGIN_ROOT}/hooks/lifecycle-manager.ts\""
    }]
  }]
}
```

### hooks/lifecycle-manager.ts

```typescript
import { AgentRegistry } from 'claude-agent-lifecycle';
import { getHookEvent } from 'claude-hooks-sdk';

async function main() {
  const event = getHookEvent();
  const registry = new AgentRegistry();

  switch (event.type) {
    case 'Stop':
      // Dispose turn-scoped agents
      await registry.disposeByLifespan('turn');
      break;

    case 'SessionEnd':
      // Dispose session-scoped agents
      await registry.disposeByScope(event.session.sessionId);
      break;
  }
}

main().catch(console.error);
```

---

## API Reference

### AgentRegistry

```typescript
const registry = new AgentRegistry(options?: {
  storagePath?: string;  // Default: '.agent/agents'
  debug?: boolean;       // Enable debug logging
});
```

### Methods

| Method | Description |
|--------|-------------|
| `create(config)` | Create or resume an agent |
| `resume(name, scope?)` | Resume an existing agent by name |
| `dispose(agentId)` | Dispose a specific agent |
| `disposeByLifespan(lifespan)` | Dispose all agents of a lifespan type |
| `disposeByScope(scope)` | Dispose all agents in a scope |
| `list(filter?)` | List agents matching a filter |
| `startWorkflow(config)` | Start a workflow-scoped agent |
| `completeWorkflow(workflowId)` | Complete workflow and dispose agents |
| `getWorkflowAgents(workflowId)` | Get all agents for a workflow |

### Agent Object

```typescript
interface Agent {
  agentId: string;       // Unique identifier
  name: string;          // Human-readable name
  lifespan: Lifespan;    // One of the 6 lifespans
  scope: string;         // Scope identifier
  model?: string;        // Model preference
  turnCount: number;     // Number of interactions
  metadata?: Record<string, unknown>;
  createdAt: string;
  lastActiveAt: string;
}
```

---

## Storage Structure

```
.agent/
└── agents/
    ├── lifecycle.log      # Debug logs (when enabled)
    ├── session/
    │   └── {session-id}/
    │       └── {agent-name}.json
    ├── workflow/
    │   └── {workflow-id}/
    │       └── {agent-name}.json
    └── project/
        └── {agent-name}.json
```

---

## Debug Mode

Enable debug logging for troubleshooting:

```bash
# Environment variable
export AGENT_LIFECYCLE_DEBUG=true

# Or per-session
AGENT_LIFECYCLE_DEBUG=true claude
```

Output:
```
[agent-lifecycle] SessionStart: abc-123 (source: new)
[agent-lifecycle] Active agents: advisor(session), helper(turn)
[agent-lifecycle] Stop: Disposed 1 turn-scoped agents
```

---

## Best Practices

1. **Choose the right lifespan** - Don't use `session` when `turn` suffices
2. **Name agents descriptively** - `backend-dev` not `agent1`
3. **Use metadata** - Store role, capabilities, preloaded context
4. **Let hooks handle cleanup** - Don't manually dispose turn/session agents
5. **Group workflow agents** - Use same workflowId for related agents
6. **Enable debug in development** - Helps track agent lifecycle issues

---

## Installation

```bash
# As Claude Code plugin (recommended)
/plugin marketplace add hgeldenhuys/claude-agent-lifecycle
/plugin install claude-agent-lifecycle

# As npm package
bun add claude-agent-lifecycle
```

---

## Related Plugins

- **claude-weave** - Uses session-scoped Shadow Advisor and Librarian
- **claude-loom** - Uses workflow-scoped story execution agents
