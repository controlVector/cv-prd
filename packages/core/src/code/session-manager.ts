/**
 * CV Code - Session Manager
 *
 * Manages coding sessions with persistence and resumption
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  CodeSession,
  ActiveContext,
  CodeMessage,
  Edit,
  EditResult,
} from './types.js';
import { GraphManager } from '../graph/index.js';

/**
 * Manages code sessions
 */
export class SessionManager {
  private sessionsDir: string;
  private currentSession: CodeSession | null = null;
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.sessionsDir = path.join(repoRoot, '.cv', 'sessions');
  }

  /**
   * Create a new session
   */
  async createSession(branch: string, commitSha: string): Promise<CodeSession> {
    const session: CodeSession = {
      id: uuidv4(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      repoRoot: this.repoRoot,
      branch,
      commitAtStart: commitSha,
      messages: [],
      activeContext: this.createDefaultContext(),
      pendingEdits: [],
      appliedEdits: [],
      metadata: {
        totalTokens: 0,
        totalEdits: 0,
        filesModified: [],
      },
    };

    this.currentSession = session;
    await this.saveSession(session);

    return session;
  }

  /**
   * Create default active context
   */
  private createDefaultContext(): ActiveContext {
    return {
      explicitFiles: [],
      discoveredFiles: [],
      activeSymbols: [],
      tokenCount: 0,
      tokenLimit: 100000,
    };
  }

  /**
   * Get current session, or null if none active
   */
  getCurrentSession(): CodeSession | null {
    return this.currentSession;
  }

  /**
   * Get or create a session
   */
  async getOrCreateSession(
    branch: string,
    commitSha: string
  ): Promise<CodeSession> {
    if (this.currentSession) {
      return this.currentSession;
    }
    return this.createSession(branch, commitSha);
  }

  /**
   * Resume an existing session by ID
   */
  async resumeSession(sessionId: string): Promise<CodeSession> {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);

    try {
      const data = await fs.readFile(sessionPath, 'utf-8');
      this.currentSession = JSON.parse(data);
      return this.currentSession!;
    } catch (error: any) {
      throw new Error(`Session not found: ${sessionId}`);
    }
  }

  /**
   * Save current session to disk
   */
  async saveSession(session: CodeSession): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });

    session.updatedAt = Date.now();
    const sessionPath = path.join(this.sessionsDir, `${session.id}.json`);

    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));
  }

  /**
   * Save current session (convenience method)
   */
  async save(): Promise<void> {
    if (this.currentSession) {
      await this.saveSession(this.currentSession);
    }
  }

  /**
   * List all available sessions
   */
  async listSessions(): Promise<
    Array<{
      id: string;
      branch: string;
      createdAt: number;
      updatedAt: number;
      messageCount: number;
      filesModified: string[];
    }>
  > {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
      const files = await fs.readdir(this.sessionsDir);

      const sessions = await Promise.all(
        files
          .filter((f) => f.endsWith('.json'))
          .map(async (f) => {
            try {
              const data = await fs.readFile(
                path.join(this.sessionsDir, f),
                'utf-8'
              );
              const session: CodeSession = JSON.parse(data);
              return {
                id: session.id,
                branch: session.branch,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                messageCount: session.messages.length,
                filesModified: session.metadata.filesModified,
              };
            } catch {
              return null;
            }
          })
      );

      return sessions
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
      await fs.unlink(sessionPath);

      if (this.currentSession?.id === sessionId) {
        this.currentSession = null;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Add a message to current session
   */
  addMessage(message: CodeMessage): void {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    this.currentSession.messages.push(message);
  }

  /**
   * Add edits to pending
   */
  addPendingEdits(edits: Edit[]): void {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    this.currentSession.pendingEdits.push(...edits);
  }

  /**
   * Move edit from pending to applied
   */
  markEditApplied(result: EditResult): void {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    // Remove from pending
    this.currentSession.pendingEdits = this.currentSession.pendingEdits.filter(
      (e) => e.id !== result.edit.id
    );

    // Add to applied
    this.currentSession.appliedEdits.push(result);

    // Update metadata
    if (!this.currentSession.metadata.filesModified.includes(result.edit.file)) {
      this.currentSession.metadata.filesModified.push(result.edit.file);
    }
    this.currentSession.metadata.totalEdits++;
  }

  /**
   * Get pending edits
   */
  getPendingEdits(): Edit[] {
    return this.currentSession?.pendingEdits || [];
  }

  /**
   * Get applied edits (for undo)
   */
  getAppliedEdits(): EditResult[] {
    return this.currentSession?.appliedEdits || [];
  }

  /**
   * Remove last applied edit (after successful undo)
   */
  popAppliedEdit(): EditResult | undefined {
    if (!this.currentSession) return undefined;
    return this.currentSession.appliedEdits.pop();
  }

  /**
   * Clear pending edits
   */
  clearPendingEdits(): void {
    if (this.currentSession) {
      this.currentSession.pendingEdits = [];
    }
  }

  /**
   * Clear conversation history (but keep edits)
   */
  clearMessages(): void {
    if (this.currentSession) {
      this.currentSession.messages = [];
    }
  }

  /**
   * Update token count in metadata
   */
  updateTokenCount(tokens: number): void {
    if (this.currentSession) {
      this.currentSession.metadata.totalTokens += tokens;
      this.currentSession.activeContext.tokenCount = tokens;
    }
  }

  /**
   * Persist session to knowledge graph for cross-session continuity
   */
  async persistToGraph(graph: GraphManager): Promise<void> {
    if (!this.currentSession) return;

    const session = this.currentSession;

    try {
      // Create or update session node
      await graph.query(
        `
        MERGE (s:CodeSession {id: $id})
        SET s.branch = $branch,
            s.commitAtStart = $commitAtStart,
            s.createdAt = $createdAt,
            s.updatedAt = $updatedAt,
            s.messageCount = $messageCount,
            s.editCount = $editCount
      `,
        {
          id: session.id,
          branch: session.branch,
          commitAtStart: session.commitAtStart,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          messageCount: session.messages.length,
          editCount: session.metadata.totalEdits,
        }
      );

      // Link to modified files
      for (const filePath of session.metadata.filesModified) {
        await graph.query(
          `
          MATCH (s:CodeSession {id: $sessionId})
          MERGE (f:File {path: $filePath})
          MERGE (s)-[:MODIFIED]->(f)
        `,
          { sessionId: session.id, filePath }
        );
      }
    } catch {
      // Graph persistence is optional, don't fail
    }
  }

  /**
   * Get recent sessions from graph (for context)
   */
  async getRecentSessionsFromGraph(
    graph: GraphManager,
    limit: number = 5
  ): Promise<
    Array<{
      id: string;
      branch: string;
      filesModified: string[];
    }>
  > {
    try {
      const result = await graph.query(
        `
        MATCH (s:CodeSession)
        OPTIONAL MATCH (s)-[:MODIFIED]->(f:File)
        RETURN s.id as id, s.branch as branch, collect(f.path) as filesModified
        ORDER BY s.updatedAt DESC
        LIMIT $limit
      `,
        { limit }
      );

      return result.map((r: any) => ({
        id: r.id,
        branch: r.branch,
        filesModified: r.filesModified || [],
      }));
    } catch {
      return [];
    }
  }

  /**
   * Export session for debugging
   */
  exportSession(): string {
    if (!this.currentSession) {
      return '{}';
    }
    return JSON.stringify(this.currentSession, null, 2);
  }
}

/**
 * Create a SessionManager instance
 */
export function createSessionManager(repoRoot: string): SessionManager {
  return new SessionManager(repoRoot);
}
