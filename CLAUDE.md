# Claude Agent Lifecycle - Development Guide

This file provides guidance to Claude Code when working in this repository.

## Project Overview

A standalone package for persistent agent lifecycle management in Claude Code projects.

## Key Concepts

### Agent Lifespans

| Lifespan | Scope | Auto-Disposal | Storage |
|----------|-------|---------------|---------|
| `ephemeral` | Single use | Immediately | Memory |
| `turn` | Response cycle | Stop event | Memory |
| `context` | Until compaction | Context reset | Memory |
| `session` | Claude session | SessionEnd event | File |
| `workflow` | Bounded work | Manual/complete | File |
| `project` | Indefinite | Manual only | File |

### Architecture

- **AgentRegistry** (`src/registry.ts`): Central registry for create/resume/dispose
- **Storage Backends** (`src/storage/`): Memory and File storage implementations
- **Types** (`src/types.ts`): Core type definitions and error classes
- **Hooks** (`hooks/`): Lifecycle hooks using claude-hooks-sdk
- **Logger** (`src/utils/logger.ts`): Opt-in debug logging

## Development Commands

```bash
# Run all tests
bun test

# Run unit tests
bun test tests/unit/

# Run integration tests
bun test tests/integration/

# Type check
bun run typecheck
```

## Code Style

- Use `for` loops over `forEach`
- TypeScript for all code
- Use Bun for package management

## Testing Strategy

- Unit tests: Test registry and storage in isolation
- Integration tests: Test lifecycle isolation and hook behavior
- Tests use `resetRegistry()` and `resetMemoryStorage()` for clean state

## Hook Configuration

Debug mode is opt-in. By default, hooks operate silently.

Enable debug mode via:
- `AGENT_LIFECYCLE_DEBUG=true` environment variable
- `--debug` flag when running hooks

## File Structure

```
claude-agent-lifecycle/
├── src/
│   ├── index.ts          # Main exports
│   ├── types.ts          # Type definitions
│   ├── registry.ts       # AgentRegistry implementation
│   ├── storage/
│   │   ├── index.ts      # Storage exports
│   │   ├── memory.ts     # In-memory storage
│   │   └── file.ts       # File-based storage
│   └── utils/
│       ├── logger.ts     # Debug logger
│       └── paths.ts      # Path utilities
├── hooks/
│   ├── README.md         # Hook documentation
│   └── lifecycle-manager.ts  # Main lifecycle hook
├── tests/
│   ├── unit/             # Unit tests
│   └── integration/      # Integration tests
└── scripts/
    └── install.ts        # Installation script
```
