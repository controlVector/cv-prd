/**
 * Platform integration tools
 * Handles pull requests, releases, and platform-specific operations
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { ToolResult } from '../types.js';
import { successResult, errorResult } from '../utils.js';

const execAsync = promisify(exec);

interface PullRequestCreateArgs {
  title?: string;
  body?: string;
  base?: string;
  draft?: boolean;
}

interface PullRequestListArgs {
  state?: 'open' | 'closed' | 'all';
  limit?: number;
}

interface PullRequestReviewArgs {
  number: number;
}

interface ReleaseCreateArgs {
  version: string;
  title?: string;
  notes?: string;
  draft?: boolean;
  prerelease?: boolean;
}

/**
 * Create a pull request
 */
export async function handlePRCreate(args: PullRequestCreateArgs): Promise<ToolResult> {
  try {
    const { title, body, base = 'main', draft = false } = args;

    // Check if gh CLI is available
    try {
      await execAsync('gh --version');
    } catch {
      return errorResult(
        'GitHub CLI not available',
        new Error('Please install GitHub CLI (gh) to use PR features: https://cli.github.com/')
      );
    }

    // Build gh pr create command
    const cmd = ['gh', 'pr', 'create'];

    if (title) {
      cmd.push('--title', `"${title}"`);
    }

    if (body) {
      cmd.push('--body', `"${body}"`);
    }

    if (base) {
      cmd.push('--base', base);
    }

    if (draft) {
      cmd.push('--draft');
    }

    const { stdout, stderr } = await execAsync(cmd.join(' '));

    if (stderr && !stdout) {
      return errorResult('Failed to create PR', new Error(stderr));
    }

    return successResult(`Pull request created successfully!\n\n${stdout.trim()}`);
  } catch (error: any) {
    return errorResult('Failed to create pull request', error);
  }
}

/**
 * List pull requests
 */
export async function handlePRList(args: PullRequestListArgs): Promise<ToolResult> {
  try {
    const { state = 'open', limit = 10 } = args;

    // Check if gh CLI is available
    try {
      await execAsync('gh --version');
    } catch {
      return errorResult(
        'GitHub CLI not available',
        new Error('Please install GitHub CLI (gh) to use PR features: https://cli.github.com/')
      );
    }

    const cmd = `gh pr list --state ${state} --limit ${limit} --json number,title,author,state,url`;
    const { stdout, stderr } = await execAsync(cmd);

    if (stderr && !stdout) {
      return errorResult('Failed to list PRs', new Error(stderr));
    }

    const prs = JSON.parse(stdout);

    if (prs.length === 0) {
      return successResult(`No ${state} pull requests found.`);
    }

    let output = `Pull Requests (${state}):\n\n`;

    for (const pr of prs) {
      output += `#${pr.number}: ${pr.title}\n`;
      output += `  Author: ${pr.author.login}\n`;
      output += `  State: ${pr.state}\n`;
      output += `  URL: ${pr.url}\n\n`;
    }

    return successResult(output.trim());
  } catch (error: any) {
    return errorResult('Failed to list pull requests', error);
  }
}

/**
 * Review a pull request with AI
 */
export async function handlePRReview(args: PullRequestReviewArgs): Promise<ToolResult> {
  try {
    const { number } = args;

    // Check if gh CLI is available
    try {
      await execAsync('gh --version');
    } catch {
      return errorResult(
        'GitHub CLI not available',
        new Error('Please install GitHub CLI (gh) to use PR features: https://cli.github.com/')
      );
    }

    // Get PR details
    const detailsCmd = `gh pr view ${number} --json number,title,body,author,state,url`;
    const { stdout: detailsOut } = await execAsync(detailsCmd);
    const pr = JSON.parse(detailsOut);

    // Get PR diff
    const diffCmd = `gh pr diff ${number}`;
    const { stdout: diffOut } = await execAsync(diffCmd);

    let output = `Pull Request #${pr.number}: ${pr.title}\n\n`;
    output += `Author: ${pr.author.login}\n`;
    output += `State: ${pr.state}\n`;
    output += `URL: ${pr.url}\n\n`;

    if (pr.body) {
      output += `Description:\n${pr.body}\n\n`;
    }

    output += `Diff Summary:\n`;
    const lines = diffOut.split('\n');
    const addedLines = lines.filter(l => l.startsWith('+')).length;
    const removedLines = lines.filter(l => l.startsWith('-')).length;
    output += `  +${addedLines} additions\n`;
    output += `  -${removedLines} deletions\n\n`;

    output += `Note: For AI-powered code review, use the cv_review tool with the PR's branch or commit.`;

    return successResult(output);
  } catch (error: any) {
    return errorResult('Failed to review pull request', error);
  }
}

/**
 * Create a release
 */
export async function handleReleaseCreate(args: ReleaseCreateArgs): Promise<ToolResult> {
  try {
    const { version, title, notes, draft = false, prerelease = false } = args;

    // Check if gh CLI is available
    try {
      await execAsync('gh --version');
    } catch {
      return errorResult(
        'GitHub CLI not available',
        new Error('Please install GitHub CLI (gh) to use release features: https://cli.github.com/')
      );
    }

    // Build gh release create command
    const cmd = ['gh', 'release', 'create', version];

    if (title) {
      cmd.push('--title', `"${title}"`);
    }

    if (notes) {
      cmd.push('--notes', `"${notes}"`);
    } else {
      cmd.push('--generate-notes');
    }

    if (draft) {
      cmd.push('--draft');
    }

    if (prerelease) {
      cmd.push('--prerelease');
    }

    const { stdout, stderr } = await execAsync(cmd.join(' '));

    if (stderr && !stdout) {
      return errorResult('Failed to create release', new Error(stderr));
    }

    return successResult(`Release ${version} created successfully!\n\n${stdout.trim()}`);
  } catch (error: any) {
    return errorResult('Failed to create release', error);
  }
}
