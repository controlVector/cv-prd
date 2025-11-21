/**
 * cvPRD Type Definitions
 * Based on cvPRD DATA_MODELS.md
 */

export type ChunkType =
  | 'requirement'
  | 'feature'
  | 'constraint'
  | 'stakeholder'
  | 'metric'
  | 'dependency'
  | 'risk'
  | 'assumption';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export type Status = 'draft' | 'in_review' | 'approved' | 'implemented' | 'deprecated';

export type RelationshipType =
  | 'DEPENDS_ON'
  | 'REFERENCES'
  | 'PARENT_OF'
  | 'IMPLEMENTS'
  | 'CONTRADICTS'
  | 'RELATES_TO';

export interface ChunkMetadata {
  priority?: Priority;
  status?: Status;
  tags: string[];
  owner?: string;
  section_path?: string;
  custom_fields?: Record<string, any>;
}

export interface Chunk {
  id: string;
  prd_id: string;
  chunk_type: ChunkType;
  text: string;
  context_prefix?: string;
  metadata: ChunkMetadata;
  vector_id?: string;
  graph_node_id?: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface PRD {
  id: string;
  name: string;
  description?: string;
  version: number;
  content: {
    sections: any[];
    metadata: Record<string, any>;
  };
  tags: string[];
  status: Status;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface Relationship {
  id: string;
  source_chunk_id: string;
  target_chunk_id: string;
  relationship_type: RelationshipType;
  strength: number;
  metadata: Record<string, any>;
  created_at: string;
}

export interface ChunkContext {
  chunk_id: string;
  text: string;
  chunk_type: ChunkType;
  metadata: ChunkMetadata;
  relationship?: string;
  distance: number;
}

export interface AIContext {
  primary_chunk: ChunkContext;
  dependencies: ChunkContext[];
  references: ChunkContext[];
  related: ChunkContext[];
  constraints: ChunkContext[];
  strategy: 'direct' | 'expanded' | 'full' | 'summarized';
  total_tokens: number;
  max_tokens: number;
  prd_info: Record<string, any>;
}

export interface SearchRequest {
  query: string;
  filters?: {
    prd_id?: string;
    chunk_type?: ChunkType[];
    priority?: Priority[];
    status?: Status[];
    tags?: string[];
  };
  limit?: number;
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
  highlights?: string[];
}

export interface ImplementationLink {
  chunk_id: string;
  commit_sha: string;
  symbols: string[];
  files: string[];
  linked_at: string;
}
