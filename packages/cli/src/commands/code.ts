/**
 * cv code command
 * AI-powered code editing with knowledge graph context
 * Inspired by Aider but uses graph-based context management
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import * as path from 'path';
import {
  configManager,
  createVectorManager,
  createGraphManager,
  createGitManager,
  createOpenRouterClient,
  createOllamaClient,
  createCodeAssistant,
  createAIClient,
  detectAvailableProviders,
  formatModelList,
  isOllamaRunning,
  assessSystemForLocalModels,
  formatSystemAssessment,
  OPENROUTER_MODELS,
  RECOMMENDED_MODELS,
  AIClient,
  VectorManager,
  GraphManager,
  GitManager,
  CodeAssistant,
  Edit,
} from '@cv-git/core';
import { findRepoRoot, loadWorkspace, findWorkspaceRoot, CVWorkspace } from '@cv-git/shared';
import { CredentialManager } from '@cv-git/credentials';
import { addGlobalOptions, createOutput } from '../utils/output.js';
import { ensureInfrastructure, checkSyncState } from '../utils/infrastructure.js';

interface CodeOptions {
  model?: string;
  provider?: 'openrouter' | 'ollama' | 'auto';
  ollamaUrl?: string;
  yes?: boolean;
  resume?: string;
  contextLimit?: string;
  verbose?: boolean;
  quiet?: boolean;
  json?: boolean;
}

export function codeCommand(): Command {
  const cmd = new Command('code');

  cmd
    .description('AI-powered code editing with knowledge graph context')
    .argument('[instruction]', 'One-shot instruction (omit for interactive mode)')
    .option('-m, --model <model>', 'Model to use (e.g., claude-sonnet-4-5, qwen2.5-coder:14b)')
    .option('-p, --provider <provider>', 'AI provider: openrouter, ollama, or auto (default: auto)', 'auto')
    .option('--ollama-url <url>', 'Ollama server URL (default: http://localhost:11434)')
    .option('-y, --yes', 'Auto-approve all edits (no confirmation)')
    .option('-r, --resume <id>', 'Resume a previous session')
    .option('-c, --context-limit <n>', 'Token limit for context', '100000');

  addGlobalOptions(cmd);

  cmd.action(async (instruction: string | undefined, options: CodeOptions) => {
    const output = createOutput(options as any);

    try {
      // Check for workspace mode first
      const workspaceRoot = await findWorkspaceRoot();
      let workspace: CVWorkspace | null = null;
      let repoRoot: string;
      let graphDatabase: string;

      if (workspaceRoot) {
        // Workspace mode
        workspace = await loadWorkspace(workspaceRoot);
        repoRoot = workspaceRoot;
        graphDatabase = workspace?.graphDatabase || 'cv-git';
      } else {
        // Single repo mode
        const foundRoot = await findRepoRoot();
        if (!foundRoot) {
          console.error(chalk.red('Not in a CV-Git repository. Run `cv init` first.'));
          process.exit(1);
        }
        repoRoot = foundRoot;
        graphDatabase = 'cv-git';
      }

      // Load configuration
      const config = await configManager.load(repoRoot);

      // Use workspace graph database if available
      if (workspace) {
        graphDatabase = workspace.graphDatabase;
      } else if (config.graph?.database) {
        graphDatabase = config.graph.database;
      }

      // Get API keys
      let openrouterApiKey = process.env.OPENROUTER_API_KEY;
      let openaiApiKey = process.env.OPENAI_API_KEY;

      try {
        const credentials = new CredentialManager();
        await credentials.init();

        if (!openrouterApiKey) {
          openrouterApiKey = await credentials.getOpenRouterKey() || undefined;
        }
        if (!openaiApiKey) {
          openaiApiKey = await credentials.getOpenAIKey() || undefined;
        }
      } catch {
        // Credential manager not available
      }

      // Initialize Git manager
      // For workspaces, use the current directory if it's a git repo, otherwise use first repo
      let gitRoot = repoRoot;
      if (workspace) {
        // Check if current directory is inside one of the workspace repos
        const cwd = process.cwd();
        const matchingRepo = workspace.repos.find(r => cwd.startsWith(r.absolutePath));
        if (matchingRepo) {
          gitRoot = matchingRepo.absolutePath;
        } else if (workspace.repos.length > 0) {
          // Default to first repo
          gitRoot = workspace.repos[0].absolutePath;
        }
      }
      const git = createGitManager(gitRoot);
      let branch = 'main';
      let commitSha = 'HEAD';
      try {
        branch = await git.getCurrentBranch();
        const commits = await git.getRecentCommits(1);
        commitSha = commits.length > 0 ? commits[0].sha : 'HEAD';
      } catch {
        // Git info not available (workspace root isn't a git repo)
      }

      // Detect available providers
      const providers = await detectAvailableProviders(openrouterApiKey, options.ollamaUrl);
      const requestedProvider = options.provider || 'auto';

      // Create AI client based on provider
      let aiClient: AIClient;

      if (requestedProvider === 'ollama' || (requestedProvider === 'auto' && providers.ollama)) {
        // Use Ollama
        if (!providers.ollama) {
          console.error(chalk.red('Ollama is not running.'));
          console.error(chalk.gray('Start Ollama with: ollama serve'));
          console.error(chalk.gray('Or use OpenRouter: cv code -p openrouter'));
          process.exit(1);
        }

        const ollamaModel = options.model || 'qwen2.5-coder:14b';
        aiClient = createOllamaClient({
          baseUrl: options.ollamaUrl,
          model: ollamaModel,
          maxTokens: 8192,
        });

        // Check if model is available
        const ready = await aiClient.isReady();
        if (!ready) {
          console.log(chalk.yellow(`Model '${ollamaModel}' not found locally.`));
          console.log();

          // Assess system and recommend appropriate models
          const assessment = await assessSystemForLocalModels();

          if (!assessment.canRunLocal) {
            console.log(chalk.red('Your system may not be suitable for local model inference.'));
            console.log(chalk.gray('Run `cv code system` for detailed hardware analysis.'));
            console.log();
            console.log(chalk.gray('Consider using cloud providers instead:'));
            console.log(chalk.gray('  cv code -p openrouter'));
          } else {
            const best = assessment.recommendedModels.find(m => m.estimatedPerformance !== 'not-recommended');
            if (best && best.modelId !== ollamaModel) {
              console.log(chalk.cyan(`Based on your hardware, we recommend: ${best.modelId}`));
              console.log(chalk.gray(`  ${best.reason}`));
              if (best.warning) {
                console.log(chalk.yellow(`  ⚠ ${best.warning}`));
              }
              console.log();
            }
            console.log(chalk.gray(`Pull the model with: ollama pull ${best?.modelId || ollamaModel}`));
            console.log(chalk.gray(''));
            console.log(chalk.gray('Run `cv code system` to see all compatible models for your hardware.'));
          }
          process.exit(1);
        }

      } else if (requestedProvider === 'openrouter' || (requestedProvider === 'auto' && providers.openrouter)) {
        // Use OpenRouter
        if (!openrouterApiKey) {
          console.error(chalk.red('OpenRouter API key not found.'));
          console.error(chalk.gray('Run: cv auth setup openrouter'));
          console.error(chalk.gray('Or set: export OPENROUTER_API_KEY=sk-or-...'));
          console.error(chalk.gray(''));
          console.error(chalk.gray('Alternatively, use local Ollama:'));
          console.error(chalk.gray('  1. Install: https://ollama.ai'));
          console.error(chalk.gray('  2. Start: ollama serve'));
          console.error(chalk.gray('  3. Pull model: ollama pull qwen2.5-coder:14b'));
          console.error(chalk.gray('  4. Run: cv code -p ollama'));
          process.exit(1);
        }

        const model = options.model || 'claude-sonnet-4-5';
        aiClient = createOpenRouterClient({
          apiKey: openrouterApiKey,
          model,
          maxTokens: 128000,
        });

      } else {
        // No provider available
        console.error(chalk.red('No AI provider available.'));
        console.error(chalk.gray(''));
        console.error(chalk.gray('Option 1 - Use local Ollama (free, private):'));
        console.error(chalk.gray('  1. Install: https://ollama.ai'));
        console.error(chalk.gray('  2. Start: ollama serve'));
        console.error(chalk.gray('  3. Pull model: ollama pull qwen2.5-coder:14b'));
        console.error(chalk.gray(''));
        console.error(chalk.gray('Option 2 - Use OpenRouter (cloud API):'));
        console.error(chalk.gray('  export OPENROUTER_API_KEY=sk-or-...'));
        process.exit(1);
      }

      // Initialize vector manager for context (if available)
      let vector: VectorManager | null = null;
      let graph: GraphManager | null = null;

      // Ensure infrastructure is running (auto-start containers if needed)
      const infra = await ensureInfrastructure({ silent: true });

      // Check if sync has been done
      // For workspaces, check workspace sync status; for single repos, check repo sync status
      if (workspace) {
        // Check if workspace has been synced (has lastSyncedAt)
        if (!workspace.lastSyncedAt) {
          console.log(chalk.yellow('⚠ Workspace has not been synced yet.'));
          console.log(chalk.gray('  Run `cv sync` to index the codebase for AI context.'));
          console.log(chalk.gray('  Without sync, AI will have limited knowledge of your code.\n'));
        }
      } else {
        const syncStatus = await checkSyncState(repoRoot);
        if (!syncStatus.hasSynced) {
          console.log(chalk.yellow('⚠ Repository has not been synced yet.'));
          console.log(chalk.gray('  Run `cv sync` to index the codebase for AI context.'));
          console.log(chalk.gray('  Without sync, AI will have limited knowledge of your code.\n'));
        } else if (syncStatus.needsResync) {
          console.log(chalk.yellow('⚠ Code has changed since last sync.'));
          console.log(chalk.gray('  Run `cv sync --incremental` to update the index.\n'));
        }
      }

      // Configure embedding provider for VectorManager
      if (openrouterApiKey && !openaiApiKey) {
        // Use OpenRouter for embeddings when no OpenAI key is available
        if (!process.env.OPENROUTER_API_KEY) {
          process.env.OPENROUTER_API_KEY = openrouterApiKey;
        }
        if (!process.env.CV_EMBEDDING_MODEL) {
          process.env.CV_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
        }
      }

      const embeddingKey = openaiApiKey || openrouterApiKey;
      if (embeddingKey && infra.qdrant.available && infra.qdrant.url) {
        try {
          vector = createVectorManager(
            infra.qdrant.url,
            openaiApiKey,
            config.vector?.collections || { codeChunks: 'code_chunks', docstrings: 'docstrings', commits: 'commits' }
          );
          await vector.connect();
        } catch (e) {
          output.debug?.('Vector DB not available, continuing without semantic search');
        }
      }

      if (infra.falkordb.available && infra.falkordb.url) {
        try {
          graph = createGraphManager(infra.falkordb.url, graphDatabase);
          await graph.connect();
        } catch (e) {
          output.debug?.('Graph DB not available, continuing without relationships');
        }
      }

      // Create CodeAssistant
      const assistant = createCodeAssistant(
        repoRoot,
        vector,
        graph,
        git,
        aiClient,
        { contextLimit: parseInt(options.contextLimit || '100000', 10) }
      );

      // Initialize or resume session
      await assistant.initSession(branch, commitSha, options.resume);

      // Show startup info
      console.log();
      console.log(chalk.bold.cyan('cv code') + chalk.gray(` - using ${assistant.getModel()}`));
      if (workspace) {
        console.log(chalk.cyan(`Workspace: ${workspace.name}`) + chalk.gray(` (${workspace.repos.length} repos)`));
        console.log(chalk.gray(`  Repos: ${workspace.repos.map(r => r.name).join(', ')}`));
      }
      console.log(chalk.gray(`Branch: ${branch} @ ${commitSha.slice(0, 7)}`));
      if (vector && graph) {
        console.log(chalk.green('✓') + chalk.gray(` Knowledge graph: ${graphDatabase}`));
      } else if (graph) {
        console.log(chalk.green('✓') + chalk.gray(` Graph context: ${graphDatabase}`) + chalk.yellow(' (no embeddings)'));
      } else {
        console.log(chalk.yellow('○') + chalk.gray(' No context (run `cv sync` first)'));
      }
      console.log();

      // One-shot mode
      if (instruction) {
        await handleSingleInstruction(instruction, assistant, options.yes || false);
        await cleanup(vector, graph);
        return;
      }

      // Interactive mode
      await interactiveMode(assistant, options.yes || false);
      await cleanup(vector, graph);

    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      if (process.env.CV_DEBUG) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

  // Subcommand to list sessions
  cmd
    .command('sessions')
    .description('List available sessions')
    .action(async () => {
      try {
        const repoRoot = await findRepoRoot();
        if (!repoRoot) {
          console.error(chalk.red('Not in a CV-Git repository.'));
          process.exit(1);
        }

        const git = createGitManager(repoRoot);
        const aiClient = createOpenRouterClient({ apiKey: 'dummy', model: 'claude-sonnet-4-5' });
        const assistant = createCodeAssistant(repoRoot, null, null, git, aiClient);

        const sessions = await assistant.listSessions();

        if (sessions.length === 0) {
          console.log(chalk.gray('No sessions found.'));
          return;
        }

        console.log(chalk.bold('\nAvailable Sessions:\n'));
        for (const session of sessions) {
          const date = new Date(session.updatedAt).toLocaleDateString();
          const time = new Date(session.updatedAt).toLocaleTimeString();
          console.log(
            chalk.cyan(session.id.slice(0, 8)) +
            chalk.gray(` - ${session.branch} - ${date} ${time}`)
          );
          console.log(chalk.gray(`  Messages: ${session.messageCount}, Files: ${session.filesModified.length}`));
          if (session.filesModified.length > 0) {
            console.log(chalk.gray(`  Modified: ${session.filesModified.slice(0, 3).join(', ')}${session.filesModified.length > 3 ? '...' : ''}`));
          }
          console.log();
        }

        console.log(chalk.gray('Resume with: cv code -r <session-id>'));
      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // Subcommand to list available models
  cmd
    .command('models')
    .description('List recommended AI models for code editing')
    .option('-p, --provider <provider>', 'Filter by provider: openrouter or ollama')
    .action(async (options: { provider?: string }) => {
      console.log(chalk.bold('\nRecommended Models for Code Editing\n'));

      // Check Ollama status
      const ollamaRunning = await isOllamaRunning();

      if (!options.provider || options.provider === 'openrouter') {
        console.log(chalk.cyan.bold('Cloud Models (OpenRouter):'));
        console.log(chalk.gray('  Requires: OPENROUTER_API_KEY environment variable\n'));

        const cloudModels = [
          { alias: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', desc: 'Best balance of speed & quality', cost: '$3/M in, $15/M out', rec: true },
          { alias: 'claude-opus-4', name: 'Claude Opus 4', desc: 'Most capable for complex tasks', cost: '$15/M in, $75/M out', rec: true },
          { alias: 'deepseek-coder', name: 'DeepSeek Coder', desc: 'Excellent code model, very cheap', cost: '$0.14/M in', rec: true },
          { alias: 'gpt-4o-mini', name: 'GPT-4o Mini', desc: 'Fast & cheap for simple edits', cost: '$0.15/M in', rec: true },
          { alias: 'gpt-4o', name: 'GPT-4o', desc: 'Strong general-purpose', cost: '$2.5/M in' },
        ];

        for (const m of cloudModels) {
          const star = m.rec ? chalk.yellow(' ★') : '';
          console.log(`  ${chalk.green(m.alias)}${star}`);
          console.log(chalk.gray(`    ${m.desc} (${m.cost})`));
        }
        console.log();
      }

      if (!options.provider || options.provider === 'ollama') {
        console.log(chalk.cyan.bold('Local Models (Ollama):'));
        if (ollamaRunning) {
          console.log(chalk.green('  ✓ Ollama is running\n'));
        } else {
          console.log(chalk.yellow('  ○ Ollama not detected - install from https://ollama.ai\n'));
        }

        const localModels = [
          { alias: 'qwen2.5-coder:32b', name: 'Qwen 2.5 Coder 32B', desc: 'Best local coding model', vram: '24GB+', rec: true },
          { alias: 'qwen2.5-coder:14b', name: 'Qwen 2.5 Coder 14B', desc: 'Great balance of size & quality', vram: '12GB+', rec: true },
          { alias: 'qwen2.5-coder:7b', name: 'Qwen 2.5 Coder 7B', desc: 'Lightweight, good for quick edits', vram: '8GB+' },
          { alias: 'deepseek-coder-v2:16b', name: 'DeepSeek Coder V2', desc: 'Strong coding with long context', vram: '12GB+', rec: true },
          { alias: 'codellama:34b', name: 'CodeLlama 34B', desc: 'Meta\'s coding model', vram: '24GB+' },
          { alias: 'llama3.1:8b', name: 'Llama 3.1 8B', desc: 'Fast general model', vram: '8GB+' },
        ];

        for (const m of localModels) {
          const star = m.rec ? chalk.yellow(' ★') : '';
          console.log(`  ${chalk.green(m.alias)}${star}`);
          console.log(chalk.gray(`    ${m.desc} (requires ${m.vram} VRAM)`));
        }
        console.log();
        console.log(chalk.gray('  Install with: ollama pull <model-name>'));
        console.log(chalk.gray('  Example: ollama pull qwen2.5-coder:14b'));
        console.log();
      }

      console.log(chalk.bold('Usage:'));
      console.log(chalk.gray('  cv code -m claude-sonnet-4-5    # Use Claude via OpenRouter'));
      console.log(chalk.gray('  cv code -p ollama -m qwen2.5-coder:14b  # Use local Ollama'));
      console.log(chalk.gray('  cv code                         # Auto-detect best available'));
      console.log();
    });

  // Subcommand to check system capabilities
  cmd
    .command('system')
    .description('Check system capabilities for local model inference')
    .action(async () => {
      console.log(chalk.bold('\nAnalyzing System Capabilities...\n'));

      try {
        const assessment = await assessSystemForLocalModels();

        // Format and display
        const output = formatSystemAssessment(assessment);

        // Color-code the output
        for (const line of output.split('\n')) {
          if (line.includes('🚀')) {
            console.log(chalk.green(line));
          } else if (line.includes('⚡')) {
            console.log(chalk.cyan(line));
          } else if (line.includes('🐢')) {
            console.log(chalk.yellow(line));
          } else if (line.includes('⚠')) {
            console.log(chalk.yellow(line));
          } else if (line.startsWith('  GPU:') || line.startsWith('  RAM:') || line.startsWith('  CPU:')) {
            console.log(chalk.gray(line));
          } else if (line.includes('Recommended:') || line.includes('Install with:')) {
            console.log(chalk.green(line));
          } else if (line.includes('not meet') || line.includes('not recommended')) {
            console.log(chalk.red(line));
          } else {
            console.log(line);
          }
        }
        console.log();

        // Show quick start if local models are viable
        if (assessment.canRunLocal) {
          const best = assessment.recommendedModels.find(m => m.estimatedPerformance !== 'not-recommended');
          if (best) {
            console.log(chalk.bold('Quick Start:'));
            console.log(chalk.gray(`  1. Install Ollama: https://ollama.ai`));
            console.log(chalk.gray(`  2. Pull model: ollama pull ${best.modelId}`));
            console.log(chalk.gray(`  3. Run: cv code -p ollama -m ${best.modelId}`));
            console.log();
          }
        }
      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Handle a single instruction (one-shot mode)
 */
async function handleSingleInstruction(
  instruction: string,
  assistant: CodeAssistant,
  autoApprove: boolean
): Promise<void> {
  const spinner = ora('Thinking...').start();

  try {
    const result = await assistant.processMessage(instruction, {
      onToken: (token) => {
        if (spinner.isSpinning) {
          spinner.stop();
          process.stdout.write(chalk.cyan('Assistant: '));
        }
        process.stdout.write(token);
      },
      onEdit: (edit) => {
        // Will handle after response
      },
      onError: (error) => {
        spinner.stop();
        console.error(chalk.red(`\nError: ${error.message}`));
      },
    });

    console.log('\n');

    // Show pending edits
    if (result.edits.length > 0) {
      await showAndApplyEdits(assistant, result.edits, autoApprove);
    }
  } catch (error: any) {
    spinner.stop();
    throw error;
  }
}

/**
 * Interactive REPL mode
 */
async function interactiveMode(
  assistant: CodeAssistant,
  autoApprove: boolean
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.gray('Type instructions for code changes. Commands: /help, /quit\n'));

  const askQuestion = (): void => {
    rl.question(chalk.green('You: '), async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        askQuestion();
        return;
      }

      // Handle commands
      if (trimmed.startsWith('/')) {
        const shouldContinue = await handleCommand(trimmed, assistant, rl, autoApprove);
        if (!shouldContinue) {
          return;
        }
        askQuestion();
        return;
      }

      // Process instruction
      const spinner = ora('Thinking...').start();

      try {
        const result = await assistant.processMessage(trimmed, {
          onToken: (token) => {
            if (spinner.isSpinning) {
              spinner.stop();
              process.stdout.write('\r\x1b[K'); // Clear line
              process.stdout.write(chalk.cyan('Assistant: '));
            }
            process.stdout.write(token);
          },
          onError: (error) => {
            spinner.stop();
            console.error(chalk.red(`\nError: ${error.message}`));
          },
        });

        console.log('\n');

        // Show pending edits
        if (result.edits.length > 0) {
          await showAndApplyEdits(assistant, result.edits, autoApprove);
        }
      } catch (error: any) {
        spinner.stop();
        console.error(chalk.red(`Error: ${error.message}`));
      }

      askQuestion();
    });
  };

  askQuestion();

  // Handle Ctrl+C gracefully
  rl.on('close', async () => {
    console.log(chalk.gray('\nSaving session...'));
    await assistant.saveSession();
    console.log(chalk.gray('Goodbye!'));
    process.exit(0);
  });
}

/**
 * Handle REPL commands
 */
async function handleCommand(
  command: string,
  assistant: CodeAssistant,
  rl: readline.Interface,
  autoApprove: boolean
): Promise<boolean> {
  const parts = command.split(' ');
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ');

  switch (cmd) {
    case '/help':
      console.log(chalk.gray(`
Commands:
  /add <file>      Add file to explicit context
  /drop <file>     Remove file from context
  /diff            Show pending changes as unified diff
  /apply           Apply all pending edits
  /undo            Revert last applied edit
  /context         Show current context summary
  /clear           Clear conversation history
  /model <name>    Switch model
  /sessions        List available sessions
  /save            Save current session
  /quit            Exit (session auto-saved)
`));
      break;

    case '/add':
      if (arg) {
        assistant.addFile(arg);
        console.log(chalk.green(`✓ Added ${arg} to context\n`));
      } else {
        console.log(chalk.yellow('Usage: /add <file-path>\n'));
      }
      break;

    case '/drop':
      if (arg) {
        assistant.dropFile(arg);
        console.log(chalk.green(`✓ Removed ${arg} from context\n`));
      } else {
        console.log(chalk.yellow('Usage: /drop <file-path>\n'));
      }
      break;

    case '/diff':
      await showPendingDiffs(assistant);
      break;

    case '/apply':
      await applyAllEdits(assistant, autoApprove);
      break;

    case '/undo':
      const undone = await assistant.undoLastEdit();
      if (undone) {
        console.log(chalk.green('✓ Reverted last edit\n'));
      } else {
        console.log(chalk.yellow('No edits to undo\n'));
      }
      break;

    case '/context':
      console.log(chalk.gray('\nContext Summary:'));
      console.log(assistant.getContextSummary());
      console.log();
      break;

    case '/clear':
      assistant.clearHistory();
      console.log(chalk.gray('Conversation history cleared.\n'));
      break;

    case '/model':
      if (arg) {
        assistant.setModel(arg);
        console.log(chalk.gray(`Switched to ${assistant.getModel()}\n`));
      } else {
        console.log(chalk.gray(`Current model: ${assistant.getModel()}\n`));
      }
      break;

    case '/sessions':
      const sessions = await assistant.listSessions();
      if (sessions.length === 0) {
        console.log(chalk.gray('No sessions found.\n'));
      } else {
        console.log(chalk.gray('\nRecent sessions:'));
        for (const s of sessions.slice(0, 5)) {
          console.log(chalk.gray(`  ${s.id.slice(0, 8)} - ${s.branch} (${s.messageCount} messages)`));
        }
        console.log();
      }
      break;

    case '/save':
      await assistant.saveSession();
      console.log(chalk.green('✓ Session saved\n'));
      break;

    case '/quit':
    case '/exit':
      console.log(chalk.gray('Saving session...'));
      await assistant.saveSession();
      console.log(chalk.gray('Goodbye!'));
      rl.close();
      return false;

    default:
      console.log(chalk.yellow(`Unknown command: ${cmd}. Type /help for commands.\n`));
  }

  return true;
}

/**
 * Show pending diffs
 */
async function showPendingDiffs(assistant: CodeAssistant): Promise<void> {
  const edits = assistant.getPendingEdits();

  if (edits.length === 0) {
    console.log(chalk.gray('No pending edits.\n'));
    return;
  }

  console.log(chalk.bold(`\n${edits.length} pending edit(s):\n`));

  for (const edit of edits) {
    const diff = await assistant.generateDiff(edit);
    console.log(assistant.formatDiffForDisplay(diff));
  }
}

/**
 * Show and optionally apply edits
 */
async function showAndApplyEdits(
  assistant: CodeAssistant,
  edits: Edit[],
  autoApprove: boolean
): Promise<void> {
  console.log(chalk.bold(`${edits.length} edit(s) proposed:\n`));

  // Show each edit
  for (const edit of edits) {
    const diff = await assistant.generateDiff(edit);
    console.log(assistant.formatDiffForDisplay(diff));
  }

  if (autoApprove) {
    // Auto-apply all
    assistant.approveAllEdits();
    const results = await assistant.applyEdits({ autoApprove: true });

    const success = results.filter(r => r.success).length;
    const failed = results.length - success;

    if (success > 0) {
      console.log(chalk.green(`✓ Applied ${success} edit(s)`));
    }
    if (failed > 0) {
      console.log(chalk.red(`✗ ${failed} edit(s) failed`));
      for (const r of results.filter(r => !r.success)) {
        console.log(chalk.red(`  - ${r.edit.file}: ${r.error}`));
      }
    }
    console.log();
  } else {
    console.log(chalk.gray('Use /apply to apply these changes, or /diff to review again.\n'));
  }
}

/**
 * Apply all pending edits with confirmation
 */
async function applyAllEdits(
  assistant: CodeAssistant,
  autoApprove: boolean
): Promise<void> {
  const edits = assistant.getPendingEdits();

  if (edits.length === 0) {
    console.log(chalk.gray('No pending edits to apply.\n'));
    return;
  }

  // Approve all and apply
  assistant.approveAllEdits();
  const results = await assistant.applyEdits({ autoApprove: true });

  const success = results.filter(r => r.success).length;
  const failed = results.length - success;

  if (success > 0) {
    console.log(chalk.green(`\n✓ Applied ${success} edit(s):`));
    for (const r of results.filter(r => r.success)) {
      console.log(chalk.green(`  - ${r.edit.file} (${r.edit.type})`));
    }
  }

  if (failed > 0) {
    console.log(chalk.red(`\n✗ ${failed} edit(s) failed:`));
    for (const r of results.filter(r => !r.success)) {
      console.log(chalk.red(`  - ${r.edit.file}: ${r.error}`));
    }
  }

  console.log();
}

/**
 * Cleanup resources
 */
async function cleanup(vector: VectorManager | null, graph: GraphManager | null): Promise<void> {
  if (vector) await vector.close();
  if (graph) await graph.close();
}
