/**
 * cv init command
 * Initialize CV-Git in a repository or workspace
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import inquirer from 'inquirer';
import { configManager } from '@cv-git/core';
import {
  ensureDir,
  getCVDir,
  detectProjectType,
  saveWorkspace,
  isWorkspace,
  generateDatabaseName,
  CVWorkspace,
  WorkspaceRepo,
} from '@cv-git/shared';
import { CredentialManager } from '@cv-git/credentials';
import { addGlobalOptions, createOutput } from '../utils/output.js';

export function initCommand(): Command {
  const cmd = new Command('init');

  cmd
    .description('Initialize CV-Git in the current repository or workspace')
    .option('--name <name>', 'Repository/workspace name (defaults to directory name)')
    .option('--workspace', 'Force workspace mode (multi-repo)')
    .option('--repo', 'Force single-repo mode');

  addGlobalOptions(cmd);

  cmd.action(async (options) => {
      const output = createOutput(options);
      const spinner = output.spinner('Detecting project type...').start();

      try {
        const currentDir = process.cwd();
        const projectName = options.name || path.basename(currentDir);

        // Detect project type
        const detected = await detectProjectType(currentDir);

        // Check if already initialized
        const cvDir = getCVDir(currentDir);
        if (await isWorkspace(currentDir)) {
          spinner.warn(chalk.yellow('CV-Git workspace already initialized in this directory'));
          return;
        }
        try {
          await configManager.load(currentDir);
          spinner.warn(chalk.yellow('CV-Git is already initialized in this directory'));
          return;
        } catch {
          // Not initialized, proceed
        }

        // Determine mode based on detection and options
        let mode: 'workspace' | 'repo';

        if (options.workspace) {
          mode = 'workspace';
        } else if (options.repo) {
          mode = 'repo';
        } else if (detected.type === 'workspace' && detected.childRepos && detected.childRepos.length > 0) {
          // Found child git repos - ask user
          spinner.stop();
          console.log();
          console.log(chalk.cyan(`Found ${detected.childRepos.length} git repositories in this directory:`));
          for (const repo of detected.childRepos) {
            console.log(chalk.gray(`  - ${repo.name}/`));
          }
          console.log();

          const { initMode } = await inquirer.prompt([
            {
              type: 'list',
              name: 'initMode',
              message: 'How would you like to initialize CV-Git?',
              choices: [
                {
                  name: `Workspace mode - Create unified index across all ${detected.childRepos.length} repos`,
                  value: 'workspace',
                },
                {
                  name: 'Skip - Initialize individual repos separately',
                  value: 'skip',
                },
              ],
            },
          ]);

          if (initMode === 'skip') {
            console.log(chalk.gray('\nTo initialize a single repo, cd into it and run `cv init`'));
            return;
          }

          mode = initMode;
          spinner.start('Initializing CV-Git workspace...');
        } else if (detected.type === 'repo') {
          mode = 'repo';
        } else {
          spinner.fail(chalk.red('Not a git repository and no child repos found'));
          console.log(chalk.gray('\nRun `cv init` inside a git repository, or in a folder containing git repos.'));
          process.exit(1);
        }

        // Create .cv directory
        spinner.text = 'Creating .cv directory...';
        await ensureDir(cvDir);
        await ensureDir(path.join(cvDir, 'cache'));
        await ensureDir(path.join(cvDir, 'sessions'));

        if (mode === 'workspace') {
          // Initialize workspace mode
          await initWorkspace(currentDir, projectName, detected.childRepos || [], spinner, output);
        } else {
          // Initialize single repo mode
          await initSingleRepo(currentDir, projectName, spinner, output);
        }

        spinner.succeed(`CV-Git ${mode === 'workspace' ? 'workspace' : 'repository'} initialized successfully!`);

        if (output.isJson) {
          output.json({ success: true, name: projectName, cvDir, mode });
        } else {
          console.log();

          // Prompt to set up credentials
          const { setupCreds } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'setupCreds',
              message: 'Would you like to set up API keys now?',
              default: true,
            },
          ]);

          if (setupCreds) {
            console.log();
            console.log(chalk.cyan('Running: cv auth setup'));
            console.log();

            // Initialize credential manager and run setup
            const credentials = new CredentialManager();
            await credentials.init();

            // Import and run auth setup dynamically to avoid circular deps
            const { execSync } = await import('child_process');
            try {
              execSync('cv auth setup', { stdio: 'inherit' });
            } catch {
              console.log(chalk.yellow('\nYou can run `cv auth setup` later to configure API keys.'));
            }
          } else {
            console.log();
            console.log(chalk.bold('Next steps:'));
            console.log(chalk.gray('  1. Set up your API keys:'));
            console.log(chalk.cyan('     cv auth setup'));
            console.log();
          }

          console.log(chalk.gray('  2. Sync your repository:'));
          console.log(chalk.cyan('     cv sync'));
          console.log();
          console.log(chalk.gray('  3. Start using CV-Git:'));
          console.log(chalk.cyan('     cv find "authentication logic"'));
          console.log(chalk.cyan('     cv do "add logging to error handlers"'));
          console.log();
        }

      } catch (error: any) {
        spinner.fail('Failed to initialize CV-Git');
        output.error('Failed to initialize CV-Git', error);
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Initialize single repo mode
 */
async function initSingleRepo(
  repoRoot: string,
  repoName: string,
  spinner: any,
  output: any
): Promise<void> {
  spinner.text = 'Creating configuration...';
  await configManager.init(repoRoot, repoName);
}

/**
 * Initialize workspace mode
 */
async function initWorkspace(
  workspaceRoot: string,
  workspaceName: string,
  childRepos: WorkspaceRepo[],
  spinner: any,
  output: any
): Promise<void> {
  spinner.text = 'Creating workspace configuration...';

  const workspace: CVWorkspace = {
    version: '1.0.0',
    name: workspaceName,
    root: workspaceRoot,
    repos: childRepos,
    createdAt: new Date().toISOString(),
    graphDatabase: generateDatabaseName(workspaceName),
  };

  await saveWorkspace(workspace);

  // Also create a minimal config.json for compatibility
  spinner.text = 'Creating configuration...';
  await configManager.init(workspaceRoot, workspaceName);
}
