/**
 * cv push command
 * Git push with automatic knowledge graph sync
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { spawn, spawnSync } from 'child_process';
import { findRepoRoot } from '@cv-git/shared';
import { addGlobalOptions, createOutput } from '../utils/output.js';

interface PushOptions {
  skipSync?: boolean;
  syncOnly?: boolean;
  force?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export function pushCommand(): Command {
  const cmd = new Command('push');

  cmd
    .description('Git push with automatic knowledge graph sync')
    .argument('[remote]', 'Remote name (default: origin)')
    .argument('[branch]', 'Branch name (default: current branch)')
    .option('--skip-sync', 'Skip knowledge graph sync after push')
    .option('--sync-only', 'Only sync, do not push')
    .option('-f, --force', 'Force push (use with caution)')
    .allowUnknownOption(true); // Allow git passthrough options

  addGlobalOptions(cmd);

  cmd.action(async (remote: string | undefined, branch: string | undefined, options: PushOptions, command: Command) => {
    const output = createOutput(options as any);

    try {
      const repoRoot = await findRepoRoot();
      if (!repoRoot) {
        console.error(chalk.red('Not in a git repository'));
        process.exit(1);
      }

      // Step 1: Git push (unless sync-only)
      if (!options.syncOnly) {
        const pushSpinner = ora('Pushing to remote...').start();

        try {
          await gitPush(remote, branch, options, command.args);
          pushSpinner.succeed(chalk.green('Pushed successfully'));
        } catch (error: any) {
          pushSpinner.fail(chalk.red('Push failed'));
          console.error(chalk.red(error.message));
          process.exit(1);
        }
      }

      // Step 2: Sync knowledge graph (unless skip-sync)
      if (!options.skipSync) {
        const syncSpinner = ora('Syncing knowledge graph...').start();

        try {
          // Run cv sync --incremental via subprocess
          const result = spawnSync('cv', ['sync', '--incremental'], {
            cwd: repoRoot,
            stdio: ['inherit', 'pipe', 'pipe'],
            encoding: 'utf-8',
          });

          if (result.status === 0) {
            syncSpinner.succeed(chalk.green('Knowledge graph synced'));
          } else {
            throw new Error(result.stderr || 'Sync failed');
          }
        } catch (error: any) {
          syncSpinner.warn(chalk.yellow(`Sync warning: ${error.message}`));
          // Don't fail the push if sync fails
          if (options.verbose) {
            console.error(chalk.gray(error.stack));
          }
        }
      }

      console.log(chalk.green('\n✓ Done'));

    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

  return cmd;
}

/**
 * Run git push with passthrough arguments
 */
async function gitPush(
  remote: string | undefined,
  branch: string | undefined,
  options: PushOptions,
  extraArgs: string[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['push'];

    // Add force flag
    if (options.force) {
      args.push('--force');
    }

    // Add remote and branch if specified
    if (remote) {
      args.push(remote);
      if (branch) {
        args.push(branch);
      }
    }

    // Add any extra passthrough arguments
    args.push(...extraArgs.filter(arg => !arg.startsWith('--skip') && !arg.startsWith('--sync')));

    const git = spawn('git', args, {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    git.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    git.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    git.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || stdout || `git push failed with code ${code}`));
      }
    });

    git.on('error', (error) => {
      reject(error);
    });
  });
}
