#!/usr/bin/env bun
/**
 * Claude Agent Lifecycle Installer
 *
 * Installs the agent lifecycle hooks into a Claude Code project.
 *
 * Usage:
 *   bun scripts/install.ts [target-path]
 *
 * Options:
 *   --debug    Enable debug mode for hooks
 *   --force    Overwrite existing hook files
 *   --help     Show help
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';

// ANSI colors for console output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(message: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step: string): void {
  console.log(`  ${colors.cyan}→${colors.reset} ${step}`);
}

function logSuccess(message: string): void {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logWarning(message: string): void {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function logError(message: string): void {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

interface InstallOptions {
  targetPath: string;
  debug: boolean;
  force: boolean;
}

function showHelp(): void {
  console.log(`
${colors.bold}Claude Agent Lifecycle Installer${colors.reset}

${colors.cyan}Usage:${colors.reset}
  bun scripts/install.ts [target-path] [options]

${colors.cyan}Arguments:${colors.reset}
  target-path    Path to Claude Code project (default: current directory)

${colors.cyan}Options:${colors.reset}
  --debug        Enable debug mode for hooks (verbose logging)
  --force        Overwrite existing hook files
  --help         Show this help message

${colors.cyan}Examples:${colors.reset}
  bun scripts/install.ts                    # Install in current directory
  bun scripts/install.ts ../my-project      # Install in another project
  bun scripts/install.ts --debug            # Enable debug logging
`);
}

function parseArgs(): InstallOptions | null {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return null;
  }

  const options: InstallOptions = {
    targetPath: process.cwd(),
    debug: args.includes('--debug'),
    force: args.includes('--force'),
  };

  // Find target path (first non-flag argument)
  for (const arg of args) {
    if (!arg.startsWith('--')) {
      options.targetPath = resolve(arg);
      break;
    }
  }

  return options;
}

function ensureDirectory(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

interface HookConfig {
  matcher: string;
  hooks: Array<{
    type: 'command';
    command: string;
  }>;
}

interface ClaudeSettings {
  hooks?: {
    Stop?: HookConfig[];
    SessionEnd?: HookConfig[];
    SessionStart?: HookConfig[];
  };
  [key: string]: unknown;
}

function readClaudeSettings(settingsPath: string): ClaudeSettings {
  if (!existsSync(settingsPath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeClaudeSettings(settingsPath: string, settings: ClaudeSettings): void {
  ensureDirectory(dirname(settingsPath));
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function install(options: InstallOptions): void {
  const { targetPath, debug, force } = options;

  log(`\n${colors.bold}Installing Claude Agent Lifecycle${colors.reset}\n`);
  log(`Target: ${targetPath}`, 'dim');
  log(`Debug: ${debug}`, 'dim');
  log('');

  // Verify target is a valid project
  if (!existsSync(targetPath)) {
    logError(`Target path does not exist: ${targetPath}`);
    process.exit(1);
  }

  // Create directories
  const agentDir = join(targetPath, '.agent');
  const hooksDir = join(agentDir, 'hooks');
  const agentsDir = join(agentDir, 'agents');
  const claudeDir = join(targetPath, '.claude');

  logStep('Creating directories...');
  ensureDirectory(agentDir);
  ensureDirectory(hooksDir);
  ensureDirectory(agentsDir);
  ensureDirectory(claudeDir);

  // Copy hook file
  const srcHookFile = join(dirname(import.meta.dir), 'hooks', 'lifecycle-manager.ts');
  const dstHookFile = join(hooksDir, 'lifecycle-manager.ts');

  if (existsSync(dstHookFile) && !force) {
    logWarning(`Hook file already exists: ${dstHookFile}`);
    logWarning('Use --force to overwrite');
  } else {
    logStep('Copying lifecycle hook...');

    // Read the hook file and modify imports for installed location
    let hookContent = readFileSync(srcHookFile, 'utf-8');

    // Update import paths for installed version
    hookContent = hookContent
      .replace(
        "from '../src/registry'",
        "from '@anthropic/claude-agent-lifecycle'"
      )
      .replace(
        "from '../src/utils/logger'",
        "from '@anthropic/claude-agent-lifecycle'"
      );

    writeFileSync(dstHookFile, hookContent);
    logSuccess('Copied lifecycle-manager.ts');
  }

  // Wire hooks into settings
  const settingsPath = join(claudeDir, 'settings.json');
  logStep('Configuring hooks in settings.json...');

  const settings = readClaudeSettings(settingsPath);
  settings.hooks = settings.hooks || {};

  const hookCommand = debug
    ? 'bun "$CLAUDE_PROJECT_DIR"/.agent/hooks/lifecycle-manager.ts --debug'
    : 'bun "$CLAUDE_PROJECT_DIR"/.agent/hooks/lifecycle-manager.ts';

  const hookConfig: HookConfig = {
    matcher: '*',
    hooks: [{ type: 'command', command: hookCommand }],
  };

  // Add Stop hook if not already present
  const hasStopHook = settings.hooks.Stop?.some(h =>
    h.hooks.some(hh => hh.command.includes('lifecycle-manager'))
  );
  if (!hasStopHook) {
    settings.hooks.Stop = settings.hooks.Stop || [];
    settings.hooks.Stop.push(hookConfig);
    logSuccess('Added Stop hook');
  } else {
    logWarning('Stop hook already configured');
  }

  // Add SessionEnd hook if not already present
  const hasSessionEndHook = settings.hooks.SessionEnd?.some(h =>
    h.hooks.some(hh => hh.command.includes('lifecycle-manager'))
  );
  if (!hasSessionEndHook) {
    settings.hooks.SessionEnd = settings.hooks.SessionEnd || [];
    settings.hooks.SessionEnd.push(hookConfig);
    logSuccess('Added SessionEnd hook');
  } else {
    logWarning('SessionEnd hook already configured');
  }

  writeClaudeSettings(settingsPath, settings);

  // Create .gitignore for agents directory
  const gitignorePath = join(agentsDir, '.gitignore');
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, '*\n!.gitignore\n');
    logSuccess('Created .gitignore for agents directory');
  }

  // Summary
  log(`\n${colors.bold}Installation Complete!${colors.reset}\n`);

  log('The following hooks are now active:', 'cyan');
  log('  • Stop → Disposes turn-scoped agents');
  log('  • SessionEnd → Disposes session-scoped agents');
  log('');

  if (debug) {
    log('Debug mode is ENABLED', 'yellow');
    log('  Logs will be written to: .agent/agents/lifecycle.log');
    log('');
  } else {
    log('Debug mode is disabled (silent operation)', 'dim');
    log('  To enable: Set AGENT_LIFECYCLE_DEBUG=true or reinstall with --debug');
    log('');
  }

  log('Usage in your code:', 'cyan');
  log(`
  import { AgentRegistry } from '@anthropic/claude-agent-lifecycle';

  const registry = new AgentRegistry();

  // Create a session-scoped agent
  const { agent, isNew } = await registry.create({
    lifespan: 'session',
    name: 'my-agent',
  });

  // Start a workflow
  const executor = await registry.startWorkflow({
    lifespan: 'workflow',
    workflowId: 'FEAT-001',
    name: 'executor',
  });

  // Complete workflow
  await registry.completeWorkflow('FEAT-001');
`);
}

// Main
const options = parseArgs();
if (options) {
  install(options);
}
