/**
 * Utility functions shared across CV-Git packages
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { CVWorkspace, WorkspaceRepo } from './types.js';

/**
 * Get the .cv directory path for a repository
 */
export function getCVDir(repoRoot: string): string {
  return path.join(repoRoot, '.cv');
}

/**
 * Check if a directory is a CV-Git repository
 */
export async function isCVRepo(dir: string): Promise<boolean> {
  try {
    const cvDir = getCVDir(dir);
    const configPath = path.join(cvDir, 'config.json');
    await fs.access(configPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the root of the CV-Git repository
 */
export async function findRepoRoot(startDir: string = process.cwd()): Promise<string | null> {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    if (await isCVRepo(currentDir)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Ensure a directory exists, create it if not
 */
export async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Generate a unique ID for a code chunk
 */
export function generateChunkId(file: string, startLine: number, endLine: number): string {
  return `${file}:${startLine}:${endLine}`;
}

/**
 * Parse a chunk ID back into components
 */
export function parseChunkId(chunkId: string): { file: string; startLine: number; endLine: number } | null {
  const parts = chunkId.split(':');
  if (parts.length < 3) {
    return null;
  }

  const endLine = parseInt(parts.pop()!);
  const startLine = parseInt(parts.pop()!);
  const file = parts.join(':');

  if (isNaN(startLine) || isNaN(endLine)) {
    return null;
  }

  return { file, startLine, endLine };
}

/**
 * Detect language from file extension
 */
export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const languageMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'typescript',  // JS uses same parser as TS
    '.jsx': 'typescript', // JSX uses same parser as TSX
    '.mjs': 'typescript',
    '.cjs': 'typescript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'zsh'
  };

  return languageMap[ext] || 'unknown';
}

/**
 * Check if a file should be synced based on patterns
 */
export function shouldSyncFile(
  filePath: string,
  excludePatterns: string[],
  includeLanguages: string[]
): boolean {
  // Check exclude patterns
  for (const pattern of excludePatterns) {
    if (matchGlob(filePath, pattern)) {
      return false;
    }
  }

  // Check language
  const language = detectLanguage(filePath);
  if (language === 'unknown') {
    return false;
  }

  // Check if language is in include list
  return includeLanguages.length === 0 || includeLanguages.includes(language);
}

/**
 * Glob pattern matching with proper ** support
 * - * matches anything except /
 * - ** matches anything including /
 * - ? matches single character
 */
function matchGlob(str: string, pattern: string): boolean {
  // Normalize path separators
  const normalizedStr = str.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Convert glob pattern to regex
  let regexPattern = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars (except * and ?)
    .replace(/\*\*/g, '{{GLOBSTAR}}')       // Temporarily replace **
    .replace(/\*/g, '[^/]*')                // * matches anything except /
    .replace(/\?/g, '[^/]')                 // ? matches single char except /
    .replace(/{{GLOBSTAR}}/g, '.*');        // ** matches anything including /

  // Pattern can match anywhere in the path if it starts with **/
  // or match from start otherwise
  if (!normalizedPattern.startsWith('**/') && !normalizedPattern.startsWith('**\\')) {
    regexPattern = '^' + regexPattern;
  }

  // Pattern must match to end if it doesn't end with **
  if (!normalizedPattern.endsWith('**')) {
    regexPattern = regexPattern + '$';
  }

  const regex = new RegExp(regexPattern);
  return regex.test(normalizedStr);
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Chunk an array into smaller arrays of specified size
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

// ========== Workspace Utilities ==========

/**
 * Check if a directory is a git repository
 */
export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const gitDir = path.join(dir, '.git');
    const stat = await fs.stat(gitDir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a directory is a CV workspace (has workspace.json)
 */
export async function isWorkspace(dir: string): Promise<boolean> {
  try {
    const workspacePath = path.join(dir, '.cv', 'workspace.json');
    await fs.access(workspacePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find git repositories in child directories
 */
export async function findChildGitRepos(dir: string): Promise<WorkspaceRepo[]> {
  const repos: WorkspaceRepo[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }

      const childPath = path.join(dir, entry.name);

      if (await isGitRepo(childPath)) {
        repos.push({
          name: entry.name,
          path: entry.name,
          absolutePath: childPath,
          synced: false,
        });
      }
    }
  } catch {
    // Directory not readable
  }

  return repos;
}

/**
 * Load workspace configuration
 */
export async function loadWorkspace(dir: string): Promise<CVWorkspace | null> {
  try {
    const workspacePath = path.join(dir, '.cv', 'workspace.json');
    const data = await fs.readFile(workspacePath, 'utf-8');
    return JSON.parse(data) as CVWorkspace;
  } catch {
    return null;
  }
}

/**
 * Save workspace configuration
 */
export async function saveWorkspace(workspace: CVWorkspace): Promise<void> {
  const workspacePath = path.join(workspace.root, '.cv', 'workspace.json');
  await fs.writeFile(workspacePath, JSON.stringify(workspace, null, 2));
}

/**
 * Find workspace root (searches up from current directory)
 */
export async function findWorkspaceRoot(startDir: string = process.cwd()): Promise<string | null> {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    if (await isWorkspace(currentDir)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Detect project type: 'workspace', 'repo', or 'none'
 */
export async function detectProjectType(dir: string): Promise<{
  type: 'workspace' | 'repo' | 'none';
  root: string | null;
  childRepos?: WorkspaceRepo[];
}> {
  // First check if it's already a CV workspace
  if (await isWorkspace(dir)) {
    return { type: 'workspace', root: dir };
  }

  // Check if it's a CV repo
  if (await isCVRepo(dir)) {
    return { type: 'repo', root: dir };
  }

  // Check if it's a git repo (potential single repo init)
  if (await isGitRepo(dir)) {
    return { type: 'repo', root: dir };
  }

  // Check if there are child git repos (potential workspace)
  const childRepos = await findChildGitRepos(dir);
  if (childRepos.length > 0) {
    return { type: 'workspace', root: dir, childRepos };
  }

  return { type: 'none', root: null };
}

/**
 * Generate a safe database name from workspace/repo name
 */
export function generateDatabaseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ========== Shared ControlVector Credentials ==========

/**
 * Path to shared ControlVector credentials file
 * Used by both cv-git and cv-prd for token sharing
 */
export function getSharedCredentialsPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.controlvector', 'credentials.json');
}

/**
 * Shared credentials structure
 */
export interface SharedCredentials {
  openrouter_key?: string;
  anthropic_key?: string;
  figma_token?: string;
  github_token?: string;
}

/**
 * Load shared ControlVector credentials
 * Returns credentials from ~/.controlvector/credentials.json
 */
export async function loadSharedCredentials(): Promise<SharedCredentials> {
  const credPath = getSharedCredentialsPath();
  try {
    const data = await fs.readFile(credPath, 'utf-8');
    return JSON.parse(data) as SharedCredentials;
  } catch {
    return {};
  }
}

/**
 * Save shared ControlVector credentials
 * Saves to ~/.controlvector/credentials.json
 */
export async function saveSharedCredentials(creds: SharedCredentials): Promise<void> {
  const credPath = getSharedCredentialsPath();
  const dir = path.dirname(credPath);

  // Ensure directory exists
  await ensureDir(dir);

  // Merge with existing credentials
  const existing = await loadSharedCredentials();
  const merged = { ...existing, ...creds };

  await fs.writeFile(credPath, JSON.stringify(merged, null, 2), { mode: 0o600 });
}

/**
 * Get API key from shared credentials or environment
 * Priority: shared credentials > environment variables
 */
export async function getApiKey(
  service: 'openrouter' | 'anthropic' | 'github' | 'figma'
): Promise<string | undefined> {
  const creds = await loadSharedCredentials();

  switch (service) {
    case 'openrouter':
      return creds.openrouter_key
        || process.env.CV_OPENROUTER_KEY
        || process.env.OPENROUTER_API_KEY;
    case 'anthropic':
      return creds.anthropic_key
        || process.env.CV_ANTHROPIC_KEY
        || process.env.ANTHROPIC_API_KEY;
    case 'github':
      return creds.github_token
        || process.env.GITHUB_TOKEN
        || process.env.GH_TOKEN;
    case 'figma':
      return creds.figma_token
        || process.env.FIGMA_API_TOKEN;
  }
}
