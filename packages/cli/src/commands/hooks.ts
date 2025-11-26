/**
 * cv hooks command
 * Manage git hooks for automatic knowledge graph sync
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import * as path from 'path';
import { findRepoRoot } from '@cv-git/shared';

const HOOK_MARKER = '# CV-GIT HOOK';

const POST_COMMIT_HOOK = `#!/bin/sh
${HOOK_MARKER} - DO NOT EDIT THIS LINE
# Auto-sync knowledge graph after commit
# Runs in background to avoid slowing down commits

cv sync --incremental --quiet 2>/dev/null &
`;

const POST_MERGE_HOOK = `#!/bin/sh
${HOOK_MARKER} - DO NOT EDIT THIS LINE
# Auto-sync knowledge graph after merge/pull
# Runs in background to avoid slowing down merges

cv sync --incremental --quiet 2>/dev/null &
`;

export function hooksCommand(): Command {
  const cmd = new Command('hooks');

  cmd.description('Manage git hooks for automatic sync');

  // cv hooks install
  cmd
    .command('install')
    .description('Install git hooks for automatic sync')
    .option('--post-commit', 'Only install post-commit hook')
    .option('--post-merge', 'Only install post-merge hook')
    .action(async (options: { postCommit?: boolean; postMerge?: boolean }) => {
      try {
        const repoRoot = await findRepoRoot();
        if (!repoRoot) {
          console.error(chalk.red('Not in a git repository'));
          process.exit(1);
        }

        const hooksDir = path.join(repoRoot, '.git', 'hooks');

        // Ensure hooks directory exists
        await fs.mkdir(hooksDir, { recursive: true });

        const installAll = !options.postCommit && !options.postMerge;
        let installed = 0;

        // Install post-commit hook
        if (installAll || options.postCommit) {
          const hookPath = path.join(hooksDir, 'post-commit');
          const result = await installHook(hookPath, POST_COMMIT_HOOK, 'post-commit');
          if (result) installed++;
        }

        // Install post-merge hook
        if (installAll || options.postMerge) {
          const hookPath = path.join(hooksDir, 'post-merge');
          const result = await installHook(hookPath, POST_MERGE_HOOK, 'post-merge');
          if (result) installed++;
        }

        if (installed > 0) {
          console.log(chalk.green(`\n✓ Installed ${installed} hook(s)`));
          console.log(chalk.gray('\nKnowledge graph will auto-sync on:'));
          if (installAll || options.postCommit) {
            console.log(chalk.gray('  • git commit'));
          }
          if (installAll || options.postMerge) {
            console.log(chalk.gray('  • git merge / git pull'));
          }
        } else {
          console.log(chalk.yellow('\nNo hooks installed (all already present)'));
        }

      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // cv hooks uninstall
  cmd
    .command('uninstall')
    .description('Remove cv-git hooks')
    .action(async () => {
      try {
        const repoRoot = await findRepoRoot();
        if (!repoRoot) {
          console.error(chalk.red('Not in a git repository'));
          process.exit(1);
        }

        const hooksDir = path.join(repoRoot, '.git', 'hooks');
        let removed = 0;

        for (const hookName of ['post-commit', 'post-merge']) {
          const hookPath = path.join(hooksDir, hookName);
          const result = await uninstallHook(hookPath, hookName);
          if (result) removed++;
        }

        if (removed > 0) {
          console.log(chalk.green(`\n✓ Removed ${removed} hook(s)`));
        } else {
          console.log(chalk.yellow('\nNo cv-git hooks found'));
        }

      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  // cv hooks status
  cmd
    .command('status')
    .description('Show installed hooks status')
    .action(async () => {
      try {
        const repoRoot = await findRepoRoot();
        if (!repoRoot) {
          console.error(chalk.red('Not in a git repository'));
          process.exit(1);
        }

        const hooksDir = path.join(repoRoot, '.git', 'hooks');

        console.log(chalk.bold('\nGit Hooks Status:\n'));

        for (const hookName of ['post-commit', 'post-merge']) {
          const hookPath = path.join(hooksDir, hookName);
          const status = await getHookStatus(hookPath);

          const icon = status === 'cv-git' ? chalk.green('✓') :
                       status === 'other' ? chalk.yellow('○') :
                       chalk.gray('·');

          const label = status === 'cv-git' ? chalk.green('cv-git hook installed') :
                        status === 'other' ? chalk.yellow('other hook present') :
                        chalk.gray('not installed');

          console.log(`  ${icon} ${hookName}: ${label}`);
        }

        console.log();

      } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Install a hook, preserving existing non-cv hooks
 */
async function installHook(hookPath: string, hookContent: string, hookName: string): Promise<boolean> {
  try {
    // Check if hook already exists
    const existingContent = await fs.readFile(hookPath, 'utf-8').catch(() => null);

    if (existingContent) {
      // Check if it's our hook
      if (existingContent.includes(HOOK_MARKER)) {
        console.log(chalk.gray(`  ${hookName}: already installed`));
        return false;
      }

      // There's an existing hook that's not ours
      // Prepend our hook and call the original
      const combinedHook = hookContent + `
# Original hook preserved below
${existingContent.replace(/^#!.*\n/, '')}
`;
      await fs.writeFile(hookPath, combinedHook, { mode: 0o755 });
      console.log(chalk.green(`  ${hookName}: installed (preserved existing hook)`));
      return true;
    }

    // No existing hook, install fresh
    await fs.writeFile(hookPath, hookContent, { mode: 0o755 });
    console.log(chalk.green(`  ${hookName}: installed`));
    return true;

  } catch (error: any) {
    console.error(chalk.red(`  ${hookName}: failed - ${error.message}`));
    return false;
  }
}

/**
 * Uninstall our hook, preserving other hooks
 */
async function uninstallHook(hookPath: string, hookName: string): Promise<boolean> {
  try {
    const existingContent = await fs.readFile(hookPath, 'utf-8').catch(() => null);

    if (!existingContent) {
      return false;
    }

    if (!existingContent.includes(HOOK_MARKER)) {
      // Not our hook
      return false;
    }

    // Check if there's preserved content after our hook
    const preservedMatch = existingContent.match(/# Original hook preserved below\n([\s\S]*)/);

    if (preservedMatch && preservedMatch[1].trim()) {
      // Restore the original hook
      const originalContent = '#!/bin/sh\n' + preservedMatch[1];
      await fs.writeFile(hookPath, originalContent, { mode: 0o755 });
      console.log(chalk.green(`  ${hookName}: removed (restored original hook)`));
    } else {
      // Just delete the hook
      await fs.unlink(hookPath);
      console.log(chalk.green(`  ${hookName}: removed`));
    }

    return true;

  } catch (error: any) {
    console.error(chalk.red(`  ${hookName}: failed - ${error.message}`));
    return false;
  }
}

/**
 * Get hook status
 */
async function getHookStatus(hookPath: string): Promise<'cv-git' | 'other' | 'none'> {
  try {
    const content = await fs.readFile(hookPath, 'utf-8');
    if (content.includes(HOOK_MARKER)) {
      return 'cv-git';
    }
    return 'other';
  } catch {
    return 'none';
  }
}
