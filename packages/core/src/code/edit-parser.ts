/**
 * CV Code - Edit Parser
 *
 * Parses AI output into structured Edit objects
 * Supports multiple edit formats: search/replace, full file, delete, rename
 */

import { v4 as uuidv4 } from 'uuid';
import { Edit, SearchReplaceBlock, FileDiff, DiffHunk, DiffLine } from './types.js';

/**
 * Parser for AI-generated code edits
 */
export class EditParser {
  // Regex for file code blocks: ```path/to/file.ts
  private static readonly FILE_BLOCK_REGEX = /```([^\s`]+)\n([\s\S]*?)```/g;

  // Regex for search/replace blocks
  private static readonly SEARCH_REPLACE_REGEX =
    /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;

  // Regex for delete marker
  private static readonly DELETE_REGEX = /<<<<<<< DELETE\n>>>>>>> DELETE/;

  // Regex for rename: old/path.ts → new/path.ts (or -> for ASCII)
  private static readonly RENAME_REGEX = /^(.+?)\s*(?:→|->)\s*(.+)$/;

  /**
   * Parse AI response into Edit objects
   */
  parseResponse(response: string, messageId: string): Edit[] {
    const edits: Edit[] = [];
    const fileBlocks = this.extractFileBlocks(response);

    for (const block of fileBlocks) {
      const edit = this.parseFileBlock(block, messageId);
      if (edit) {
        edits.push(edit);
      }
    }

    return edits;
  }

  /**
   * Extract all file code blocks from response
   */
  private extractFileBlocks(
    response: string
  ): Array<{ path: string; content: string }> {
    const blocks: Array<{ path: string; content: string }> = [];
    const regex = new RegExp(EditParser.FILE_BLOCK_REGEX.source, 'g');

    let match;
    while ((match = regex.exec(response)) !== null) {
      const path = match[1].trim();
      const content = match[2];

      // Skip non-file blocks (like ```typescript without path)
      if (this.isFilePath(path)) {
        blocks.push({ path, content });
      }
    }

    return blocks;
  }

  /**
   * Check if string looks like a file path
   */
  private isFilePath(str: string): boolean {
    // Must contain / or \ and have an extension, or be a simple filename with extension
    if (str.includes('/') || str.includes('\\')) {
      return true;
    }
    // Check for extension
    return /\.[a-zA-Z0-9]+$/.test(str);
  }

  /**
   * Parse a single file block into an Edit
   */
  private parseFileBlock(
    block: { path: string; content: string },
    messageId: string
  ): Edit | null {
    const { path, content } = block;

    // Check for rename syntax in path
    const renameMatch = path.match(EditParser.RENAME_REGEX);
    if (renameMatch) {
      return this.createRenameEdit(renameMatch[1], renameMatch[2], messageId);
    }

    // Check for delete marker
    if (EditParser.DELETE_REGEX.test(content)) {
      return this.createDeleteEdit(path, messageId);
    }

    // Check for search/replace blocks
    const searchReplaceBlocks = this.extractSearchReplaceBlocks(content);
    if (searchReplaceBlocks.length > 0) {
      return this.createModifyEdit(path, searchReplaceBlocks, messageId);
    }

    // Otherwise it's a full file (create or overwrite)
    return this.createFullFileEdit(path, content, messageId);
  }

  /**
   * Extract search/replace blocks from content
   */
  private extractSearchReplaceBlocks(content: string): SearchReplaceBlock[] {
    const blocks: SearchReplaceBlock[] = [];
    const regex = new RegExp(EditParser.SEARCH_REPLACE_REGEX.source, 'g');

    let match;
    while ((match = regex.exec(content)) !== null) {
      blocks.push({
        search: match[1],
        replace: match[2],
      });
    }

    return blocks;
  }

  /**
   * Create a rename edit
   */
  private createRenameEdit(
    oldPath: string,
    newPath: string,
    messageId: string
  ): Edit {
    return {
      id: uuidv4(),
      file: oldPath.trim(),
      type: 'rename',
      newPath: newPath.trim(),
      status: 'pending',
      messageId,
      createdAt: Date.now(),
    };
  }

  /**
   * Create a delete edit
   */
  private createDeleteEdit(path: string, messageId: string): Edit {
    return {
      id: uuidv4(),
      file: path,
      type: 'delete',
      status: 'pending',
      messageId,
      createdAt: Date.now(),
    };
  }

  /**
   * Create a modify edit with search/replace blocks
   */
  private createModifyEdit(
    path: string,
    blocks: SearchReplaceBlock[],
    messageId: string
  ): Edit {
    return {
      id: uuidv4(),
      file: path,
      type: 'modify',
      searchReplaceBlocks: blocks,
      status: 'pending',
      messageId,
      createdAt: Date.now(),
    };
  }

  /**
   * Create a full file edit (create or overwrite)
   */
  private createFullFileEdit(
    path: string,
    content: string,
    messageId: string
  ): Edit {
    // Determine if this is a create or modify based on file existence
    // For now, we'll mark it as 'create' - the file-ops will handle existing files
    return {
      id: uuidv4(),
      file: path,
      type: 'create', // Will be updated to 'modify' if file exists
      newContent: content,
      status: 'pending',
      messageId,
      createdAt: Date.now(),
    };
  }

  /**
   * Generate a unified diff for display
   */
  generateDiff(edit: Edit, originalContent?: string): FileDiff {
    const diff: FileDiff = {
      path: edit.file,
      type: edit.type,
      hunks: [],
      newPath: edit.newPath,
    };

    if (edit.type === 'delete') {
      if (originalContent) {
        diff.hunks.push(this.createDeleteHunk(originalContent));
      }
      return diff;
    }

    if (edit.type === 'rename') {
      return diff;
    }

    if (edit.type === 'create' && edit.newContent) {
      diff.hunks.push(this.createAddHunk(edit.newContent));
      return diff;
    }

    if (edit.type === 'modify' && edit.searchReplaceBlocks && originalContent) {
      // Generate hunks for each search/replace block
      for (const block of edit.searchReplaceBlocks) {
        const hunk = this.createSearchReplaceHunk(
          block,
          originalContent
        );
        if (hunk) {
          diff.hunks.push(hunk);
        }
      }
    }

    return diff;
  }

  /**
   * Create a hunk for deleted content
   */
  private createDeleteHunk(content: string): DiffHunk {
    const lines = content.split('\n');
    return {
      oldStart: 1,
      oldLines: lines.length,
      newStart: 0,
      newLines: 0,
      lines: lines.map((line, i) => ({
        type: 'remove' as const,
        content: line,
        oldLineNumber: i + 1,
      })),
    };
  }

  /**
   * Create a hunk for added content
   */
  private createAddHunk(content: string): DiffHunk {
    const lines = content.split('\n');
    return {
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: lines.length,
      lines: lines.map((line, i) => ({
        type: 'add' as const,
        content: line,
        newLineNumber: i + 1,
      })),
    };
  }

  /**
   * Create a hunk for a search/replace block
   */
  private createSearchReplaceHunk(
    block: SearchReplaceBlock,
    originalContent: string
  ): DiffHunk | null {
    const searchLines = block.search.split('\n');
    const replaceLines = block.replace.split('\n');

    // Find the position of the search block in original content
    const searchIndex = originalContent.indexOf(block.search);
    if (searchIndex === -1) {
      return null;
    }

    // Calculate line number
    const beforeSearch = originalContent.substring(0, searchIndex);
    const startLine = beforeSearch.split('\n').length;

    const lines: DiffLine[] = [];

    // Add context line before if available
    const allOriginalLines = originalContent.split('\n');
    if (startLine > 1) {
      lines.push({
        type: 'context',
        content: allOriginalLines[startLine - 2],
        oldLineNumber: startLine - 1,
        newLineNumber: startLine - 1,
      });
    }

    // Add removed lines
    searchLines.forEach((line, i) => {
      lines.push({
        type: 'remove',
        content: line,
        oldLineNumber: startLine + i,
      });
    });

    // Add added lines
    replaceLines.forEach((line, i) => {
      lines.push({
        type: 'add',
        content: line,
        newLineNumber: startLine + i,
      });
    });

    // Add context line after if available
    const afterLineIndex = startLine + searchLines.length - 1;
    if (afterLineIndex < allOriginalLines.length) {
      lines.push({
        type: 'context',
        content: allOriginalLines[afterLineIndex],
        oldLineNumber: afterLineIndex + 1,
        newLineNumber: startLine + replaceLines.length,
      });
    }

    return {
      oldStart: startLine,
      oldLines: searchLines.length,
      newStart: startLine,
      newLines: replaceLines.length,
      lines,
    };
  }

  /**
   * Format a diff for terminal display
   */
  formatDiffForDisplay(diff: FileDiff): string {
    const lines: string[] = [];

    // Header
    if (diff.type === 'rename') {
      lines.push(`--- a/${diff.path}`);
      lines.push(`+++ b/${diff.newPath}`);
      lines.push('(file renamed)');
    } else if (diff.type === 'delete') {
      lines.push(`--- a/${diff.path}`);
      lines.push(`+++ /dev/null`);
    } else if (diff.type === 'create') {
      lines.push(`--- /dev/null`);
      lines.push(`+++ b/${diff.path}`);
    } else {
      lines.push(`--- a/${diff.path}`);
      lines.push(`+++ b/${diff.path}`);
    }

    // Hunks
    for (const hunk of diff.hunks) {
      lines.push(
        `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
      );

      for (const line of hunk.lines) {
        const prefix =
          line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
        lines.push(`${prefix}${line.content}`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Create an EditParser instance
 */
export function createEditParser(): EditParser {
  return new EditParser();
}
