# Claude Agent Lifecycle

Persistent agent lifecycle management for Claude Code. Create, resume, and dispose agents with automatic lifecycle management based on scope boundaries.

## Features

- **Six Agent Lifespans**: ephemeral, turn, context, session, workflow, project
- **Automatic Disposal**: Hooks dispose agents at appropriate lifecycle events
- **Persistent Storage**: File-based storage for session/workflow/project agents
- **Memory Storage**: In-memory storage for ephemeral/turn/context agents
- **Debug Mode**: Opt-in JSON logging for debugging and monitoring
- **Hook Integration**: Uses `claude-hooks-sdk` for lifecycle event handling

## Installation

```bash
# Install the package
bun add @anthropic/claude-agent-lifecycle

# Run the installer to set up hooks
bunx @anthropic/claude-agent-lifecycle install
```

Or install manually:

```bash
bun add @anthropic/claude-agent-lifecycle
bun scripts/install.ts
```

## Quick Start

```typescript
import { AgentRegistry } from '@anthropic/claude-agent-lifecycle';

const registry = new AgentRegistry();

// Create a session-scoped agent
const { agent, isNew } = await registry.create({
  lifespan: 'session',
  name: 'shadow-advisor',
  model: 'haiku',
});

// Resume later in the session
const shadow = await registry.resume('shadow-advisor');

// Start a workflow-scoped agent
const executor = await registry.startWorkflow({
  lifespan: 'workflow',
  workflowId: 'FEAT-001',
  name: 'story-executor',
  model: 'sonnet',
});

// Complete workflow (disposes all workflow agents)
await registry.completeWorkflow('FEAT-001');
```

## Agent Lifespans

| Lifespan | Scope | Auto-Disposal | Storage |
|----------|-------|---------------|---------|
| `ephemeral` | Single use | Immediately | Memory |
| `turn` | Response cycle | Stop event | Memory |
| `context` | Until compaction | Context reset | Memory |
| `session` | Claude session | SessionEnd event | File |
| `workflow` | Bounded work unit | Manual/complete | File |
| `project` | Indefinite | Manual only | File |

### Lifespan Details

**ephemeral**: Fire-and-forget agents. Created, used once, and discarded.

**turn**: Lives for one request-response cycle. Disposed when the assistant's response completes (Stop event).

**context**: Lives until context window compaction. Useful for agents that should survive multiple turns but reset when context is cleared.

**session**: Lives for the entire Claude Code session. Disposed when the session ends (SessionEnd event).

**workflow**: Lives for a bounded unit of work (story, feature, task). Explicitly completed when work is done. Generic pattern - Loom uses this for stories.

**project**: Lives indefinitely in the project. Must be manually disposed. Useful for singleton agents like Shadow Advisor.

## API Reference

### AgentRegistry

```typescript
const registry = new AgentRegistry(options?: RegistryOptions);

interface RegistryOptions {
  storagePath?: string;  // Default: '.agent/agents'
  debug?: boolean;       // Enable debug logging
}
```

#### Methods

**create(config)**: Create or resume an agent
```typescript
const { agent, isNew } = await registry.create({
  lifespan: 'session',
  name: 'my-agent',
  sessionId: 'optional-session-id',
  model: 'haiku', // optional
  metadata: {},   // optional
});
```

**resume(name, scope?)**: Resume an existing agent by name
```typescript
const agent = await registry.resume('my-agent');
```

**dispose(agentId)**: Dispose a specific agent
```typescript
await registry.dispose(agent.agentId);
```

**disposeByLifespan(lifespan)**: Dispose all agents of a lifespan type
```typescript
const count = await registry.disposeByLifespan('turn');
```

**disposeByScope(scope)**: Dispose all agents in a scope
```typescript
const count = await registry.disposeByScope('session-123');
```

**list(filter?)**: List agents matching a filter
```typescript
const agents = await registry.list({ lifespan: 'session' });
```

### Workflow Methods

**startWorkflow(config)**: Start a workflow-scoped agent
```typescript
const agent = await registry.startWorkflow({
  lifespan: 'workflow',
  workflowId: 'FEAT-001',
  name: 'executor',
  workflowType: 'loom-story', // optional
});
```

**completeWorkflow(workflowId)**: Complete a workflow and dispose its agents
```typescript
const disposed = await registry.completeWorkflow('FEAT-001');
```

**getWorkflowAgents(workflowId)**: Get all agents for a workflow
```typescript
const agents = await registry.getWorkflowAgents('FEAT-001');
```

## Hook Configuration

Hooks are automatically installed by the installer. They can also be manually configured:

### Default Mode (Silent)

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

### Debug Log Output

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

## Storage Structure

```
.agent/
├── agents/
│   ├── lifecycle.log      # Debug logs (when enabled)
│   ├── session/
│   │   └── {session-id}/
│   │       └── {agent-name}.json
│   ├── workflow/
│   │   └── {workflow-id}/
│   │       └── {agent-name}.json
│   └── project/
│       └── {agent-name}.json
└── hooks/
    └── lifecycle-manager.ts
```

## Integration Examples

### Shadow Advisor Pattern

```typescript
import { AgentRegistry } from '@anthropic/claude-agent-lifecycle';

const registry = new AgentRegistry();

// Create or resume shadow advisor for the session
const { agent: shadow, isNew } = await registry.create({
  lifespan: 'session',
  name: 'shadow-advisor',
  model: 'haiku',
  metadata: {
    role: 'knowledge-retrieval',
    preloadedKnowledge: ['weave', 'librarian'],
  },
});

if (isNew) {
  console.log('Created new shadow advisor');
} else {
  console.log(`Resumed shadow advisor (turn ${shadow.turnCount})`);
}
```

### Loom Workflow Integration

```typescript
import { AgentRegistry } from '@anthropic/claude-agent-lifecycle';

const registry = new AgentRegistry();

// Start story execution
const executor = await registry.startWorkflow({
  lifespan: 'workflow',
  workflowId: 'ACCT-001',
  name: 'story-executor',
  workflowType: 'loom-story',
  model: 'sonnet',
});

// Additional helpers for the workflow
await registry.startWorkflow({
  lifespan: 'workflow',
  workflowId: 'ACCT-001',
  name: 'backend-dev',
  model: 'sonnet',
});

// When story is complete
await registry.completeWorkflow('ACCT-001');
// All workflow agents disposed
```

### Custom Cleanup

```typescript
import { AgentRegistry } from '@anthropic/claude-agent-lifecycle';

const registry = new AgentRegistry();

// Dispose all agents for a custom scope
await registry.disposeByScope('my-custom-scope');

// Dispose specific lifespan
await registry.disposeByLifespan('context');
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Run unit tests only
bun test tests/unit/

# Run integration tests only
bun test tests/integration/
```

## License

MIT
