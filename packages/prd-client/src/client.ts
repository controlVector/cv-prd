/**
 * cvPRD API Client
 * Provides integration with cvPRD for requirements management
 */

import {
  Chunk,
  PRD,
  AIContext,
  SearchRequest,
  SearchResult,
  Status,
  RelationshipType,
  ImplementationLink
} from './types.js';

export interface PRDClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export class PRDClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(config: PRDClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>)
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`cvPRD API error (${response.status}): ${error}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if cvPRD is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.fetch('/api/v1/health');
      return true;
    } catch {
      return false;
    }
  }

  // ========== PRD Operations ==========

  /**
   * Get a PRD by ID
   */
  async getPRD(prdId: string): Promise<PRD> {
    return this.fetch<PRD>(`/api/v1/prds/${prdId}`);
  }

  /**
   * List all PRDs
   */
  async listPRDs(options?: {
    status?: Status;
    tags?: string[];
    limit?: number;
  }): Promise<PRD[]> {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.tags) params.set('tags', options.tags.join(','));
    if (options?.limit) params.set('limit', options.limit.toString());

    const query = params.toString();
    return this.fetch<PRD[]>(`/api/v1/prds${query ? `?${query}` : ''}`);
  }

  // ========== Chunk Operations ==========

  /**
   * Get a chunk by ID
   */
  async getChunk(chunkId: string): Promise<Chunk> {
    return this.fetch<Chunk>(`/api/v1/chunks/${chunkId}`);
  }

  /**
   * Get chunks for a PRD
   */
  async getChunksForPRD(prdId: string): Promise<Chunk[]> {
    return this.fetch<Chunk[]>(`/api/v1/prds/${prdId}/chunks`);
  }

  /**
   * Update chunk status
   */
  async updateChunkStatus(chunkId: string, status: Status): Promise<Chunk> {
    return this.fetch<Chunk>(`/api/v1/chunks/${chunkId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        metadata: { status }
      })
    });
  }

  /**
   * Update chunk metadata
   */
  async updateChunkMetadata(
    chunkId: string,
    metadata: Partial<Chunk['metadata']>
  ): Promise<Chunk> {
    return this.fetch<Chunk>(`/api/v1/chunks/${chunkId}`, {
      method: 'PATCH',
      body: JSON.stringify({ metadata })
    });
  }

  // ========== Context Operations ==========

  /**
   * Get AI context for a chunk (includes dependencies)
   */
  async getContext(
    chunkId: string,
    options?: {
      depth?: number;
      maxTokens?: number;
      strategy?: 'direct' | 'expanded' | 'full' | 'summarized';
    }
  ): Promise<AIContext> {
    const params = new URLSearchParams();
    if (options?.depth) params.set('depth', options.depth.toString());
    if (options?.maxTokens) params.set('max_tokens', options.maxTokens.toString());
    if (options?.strategy) params.set('strategy', options.strategy);

    const query = params.toString();
    return this.fetch<AIContext>(
      `/api/v1/chunks/${chunkId}/context${query ? `?${query}` : ''}`
    );
  }

  /**
   * Get context for multiple chunks
   */
  async getContextBatch(
    chunkIds: string[],
    options?: {
      depth?: number;
      maxTokens?: number;
    }
  ): Promise<AIContext[]> {
    return this.fetch<AIContext[]>('/api/v1/context/batch', {
      method: 'POST',
      body: JSON.stringify({
        chunk_ids: chunkIds,
        ...options
      })
    });
  }

  // ========== Graph Operations ==========

  /**
   * Get dependencies of a chunk
   */
  async getDependencies(
    chunkId: string,
    depth: number = 3
  ): Promise<{ direct: Chunk[]; transitive: Chunk[]; circular: Chunk[] }> {
    return this.fetch(
      `/api/v1/graph/chunks/${chunkId}/dependencies?depth=${depth}`
    );
  }

  /**
   * Get chunks that depend on this chunk
   */
  async getDependents(chunkId: string): Promise<Chunk[]> {
    return this.fetch<Chunk[]>(`/api/v1/graph/chunks/${chunkId}/dependents`);
  }

  /**
   * Create a relationship between chunks
   */
  async createRelationship(
    sourceChunkId: string,
    targetChunkId: string,
    relationshipType: RelationshipType,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.fetch('/api/v1/graph/relationships', {
      method: 'POST',
      body: JSON.stringify({
        source_chunk_id: sourceChunkId,
        target_chunk_id: targetChunkId,
        relationship_type: relationshipType,
        metadata: metadata || {}
      })
    });
  }

  // ========== Search Operations ==========

  /**
   * Semantic search for chunks
   */
  async search(request: SearchRequest): Promise<SearchResult[]> {
    return this.fetch<SearchResult[]>('/api/v1/search/semantic', {
      method: 'POST',
      body: JSON.stringify(request)
    });
  }

  /**
   * Find chunks by tag
   */
  async findByTag(tag: string, limit: number = 20): Promise<Chunk[]> {
    return this.fetch<Chunk[]>(`/api/v1/chunks?tags=${tag}&limit=${limit}`);
  }

  // ========== Implementation Tracking ==========

  /**
   * Link code implementation to a requirement
   */
  async linkImplementation(
    chunkId: string,
    implementation: {
      commit_sha: string;
      symbols: string[];
      files: string[];
    }
  ): Promise<void> {
    await this.fetch(`/api/v1/chunks/${chunkId}/implementations`, {
      method: 'POST',
      body: JSON.stringify(implementation)
    });

    // Also update status to implemented
    await this.updateChunkStatus(chunkId, 'implemented');
  }

  /**
   * Get implementations for a chunk
   */
  async getImplementations(chunkId: string): Promise<ImplementationLink[]> {
    return this.fetch<ImplementationLink[]>(
      `/api/v1/chunks/${chunkId}/implementations`
    );
  }

  /**
   * Find requirements by commit
   */
  async findRequirementsByCommit(commitSha: string): Promise<Chunk[]> {
    return this.fetch<Chunk[]>(
      `/api/v1/implementations/by-commit/${commitSha}`
    );
  }

  // ========== Utility Methods ==========

  /**
   * Extract PRD references from text (PRD-123, REQ-456, etc.)
   */
  static extractPRDReferences(text: string): string[] {
    const pattern = /(PRD|REQ|FEAT|CHUNK)-[a-zA-Z0-9-]+/gi;
    const matches = text.match(pattern) || [];
    return [...new Set(matches)]; // Deduplicate
  }

  /**
   * Format context for AI prompt
   */
  static formatContextForPrompt(context: AIContext): string {
    const parts: string[] = [];

    // Primary requirement
    parts.push(`## Primary Requirement`);
    parts.push(context.primary_chunk.text);
    parts.push(`Type: ${context.primary_chunk.chunk_type}`);
    parts.push(`Priority: ${context.primary_chunk.metadata.priority || 'N/A'}`);
    parts.push('');

    // Dependencies
    if (context.dependencies.length > 0) {
      parts.push(`## Dependencies`);
      for (const dep of context.dependencies) {
        parts.push(`- ${dep.text}`);
      }
      parts.push('');
    }

    // Constraints
    if (context.constraints.length > 0) {
      parts.push(`## Constraints`);
      for (const con of context.constraints) {
        parts.push(`- ${con.text}`);
      }
      parts.push('');
    }

    // Related
    if (context.related.length > 0) {
      parts.push(`## Related Requirements`);
      for (const rel of context.related) {
        parts.push(`- ${rel.text}`);
      }
      parts.push('');
    }

    return parts.join('\n');
  }
}
