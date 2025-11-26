/**
 * CV Code - File Operations
 *
 * Safe file operations with backup and revert capability
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Edit, EditResult } from './types.js';

/**
 * Manages file operations with safety features
 */
export class FileOperations {
  private backupDir: string;
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.backupDir = path.join(repoRoot, '.cv', 'backups');
  }

  /**
   * Apply an edit to the filesystem
   */
  async applyEdit(edit: Edit): Promise<EditResult> {
    const filePath = path.join(this.repoRoot, edit.file);

    try {
      switch (edit.type) {
        case 'create':
          return await this.handleCreate(filePath, edit);
        case 'modify':
          return await this.handleModify(filePath, edit);
        case 'delete':
          return await this.handleDelete(filePath, edit);
        case 'rename':
          return await this.handleRename(filePath, edit);
        default:
          throw new Error(`Unknown edit type: ${edit.type}`);
      }
    } catch (error: any) {
      return {
        edit: { ...edit, status: 'rejected' },
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Handle file creation
   */
  private async handleCreate(filePath: string, edit: Edit): Promise<EditResult> {
    // Check if file already exists
    const exists = await this.fileExists(filePath);

    if (exists) {
      // File exists - treat as modify with full replacement
      const originalContent = await fs.readFile(filePath, 'utf-8');
      const backupPath = await this.createBackup(filePath, originalContent);

      await fs.writeFile(filePath, edit.newContent || '');

      return {
        edit: { ...edit, type: 'modify', status: 'applied', originalContent },
        success: true,
        backupPath,
        appliedAt: Date.now(),
      };
    }

    // Create directory if needed
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write new file
    await fs.writeFile(filePath, edit.newContent || '');

    return {
      edit: { ...edit, status: 'applied' },
      success: true,
      appliedAt: Date.now(),
    };
  }

  /**
   * Handle file modification with search/replace
   */
  private async handleModify(filePath: string, edit: Edit): Promise<EditResult> {
    // Read current content
    const originalContent = await fs.readFile(filePath, 'utf-8');

    // Create backup
    const backupPath = await this.createBackup(filePath, originalContent);

    let newContent: string;

    if (edit.searchReplaceBlocks && edit.searchReplaceBlocks.length > 0) {
      // Apply search/replace blocks sequentially
      newContent = originalContent;

      for (const block of edit.searchReplaceBlocks) {
        if (!newContent.includes(block.search)) {
          // Try to find approximate match
          const approxMatch = this.findApproximateMatch(newContent, block.search);
          if (approxMatch) {
            throw new Error(
              `Search block not found exactly in ${edit.file}.\n` +
              `Expected:\n${block.search.slice(0, 200)}...\n` +
              `Found similar at line ${approxMatch.line}:\n${approxMatch.text.slice(0, 200)}...`
            );
          }
          throw new Error(
            `Search block not found in ${edit.file}:\n${block.search.slice(0, 200)}...`
          );
        }
        newContent = newContent.replace(block.search, block.replace);
      }
    } else if (edit.newContent !== undefined) {
      // Full file replacement
      newContent = edit.newContent;
    } else {
      throw new Error('No search/replace blocks or new content provided');
    }

    // Write updated content
    await fs.writeFile(filePath, newContent);

    return {
      edit: { ...edit, status: 'applied', originalContent },
      success: true,
      backupPath,
      appliedAt: Date.now(),
    };
  }

  /**
   * Handle file deletion
   */
  private async handleDelete(filePath: string, edit: Edit): Promise<EditResult> {
    // Read and backup before delete
    const originalContent = await fs.readFile(filePath, 'utf-8');
    const backupPath = await this.createBackup(filePath, originalContent);

    // Delete the file
    await fs.unlink(filePath);

    return {
      edit: { ...edit, status: 'applied', originalContent },
      success: true,
      backupPath,
      appliedAt: Date.now(),
    };
  }

  /**
   * Handle file rename
   */
  private async handleRename(filePath: string, edit: Edit): Promise<EditResult> {
    if (!edit.newPath) {
      throw new Error('New path required for rename');
    }

    const newFilePath = path.join(this.repoRoot, edit.newPath);

    // Backup original
    const originalContent = await fs.readFile(filePath, 'utf-8');
    const backupPath = await this.createBackup(filePath, originalContent);

    // Create new directory if needed
    await fs.mkdir(path.dirname(newFilePath), { recursive: true });

    // Rename (move) the file
    await fs.rename(filePath, newFilePath);

    return {
      edit: { ...edit, status: 'applied', originalContent },
      success: true,
      backupPath,
      appliedAt: Date.now(),
    };
  }

  /**
   * Create a backup of file content
   */
  private async createBackup(filePath: string, content: string): Promise<string> {
    await fs.mkdir(this.backupDir, { recursive: true });

    const hash = crypto
      .createHash('md5')
      .update(content)
      .digest('hex')
      .slice(0, 8);
    const timestamp = Date.now();
    const fileName = path.basename(filePath);
    const relativePath = path.relative(this.repoRoot, filePath).replace(/\//g, '_');
    const backupPath = path.join(
      this.backupDir,
      `${relativePath}.${timestamp}.${hash}`
    );

    await fs.writeFile(backupPath, content);
    return backupPath;
  }

  /**
   * Revert an edit from its backup
   */
  async revertEdit(result: EditResult): Promise<boolean> {
    if (!result.backupPath) {
      return false;
    }

    try {
      const backupContent = await fs.readFile(result.backupPath, 'utf-8');
      const filePath = path.join(this.repoRoot, result.edit.file);

      if (result.edit.type === 'delete') {
        // Restore deleted file
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, backupContent);
      } else if (result.edit.type === 'rename' && result.edit.newPath) {
        // Rename back
        const newFilePath = path.join(this.repoRoot, result.edit.newPath);
        await fs.rename(newFilePath, filePath);
      } else {
        // Restore original content
        await fs.writeFile(filePath, backupContent);
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read file content
   */
  async readFile(relativePath: string): Promise<string> {
    const filePath = path.join(this.repoRoot, relativePath);
    return fs.readFile(filePath, 'utf-8');
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find approximate match for a search block
   * Returns line number and text if found
   */
  private findApproximateMatch(
    content: string,
    search: string
  ): { line: number; text: string } | null {
    const searchLines = search.trim().split('\n');
    const contentLines = content.split('\n');

    // Try to find first line of search
    const firstSearchLine = searchLines[0].trim();

    for (let i = 0; i < contentLines.length; i++) {
      if (contentLines[i].trim() === firstSearchLine) {
        // Found potential match, return context
        const matchText = contentLines.slice(i, i + searchLines.length).join('\n');
        return { line: i + 1, text: matchText };
      }
    }

    return null;
  }

  /**
   * Clean up old backups (older than specified days)
   */
  async cleanupBackups(maxAgeDays: number = 7): Promise<number> {
    try {
      const files = await fs.readdir(this.backupDir);
      const now = Date.now();
      const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
      let deleted = 0;

      for (const file of files) {
        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filePath);
          deleted++;
        }
      }

      return deleted;
    } catch {
      return 0;
    }
  }
}

/**
 * Create a FileOperations instance
 */
export function createFileOperations(repoRoot: string): FileOperations {
  return new FileOperations(repoRoot);
}
