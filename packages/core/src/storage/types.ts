/**
 * Storage Types for CV-Git
 *
 * Defines the schema for .cv/ file storage format.
 * Version: 1.0.0
 */

// =============================================================================
// Manifest Types
// =============================================================================

export interface StorageManifest {
  /** Schema version for migrations */
  version: string;
  /** Format identifier */
  format: 'cv-git-storage';
  /** Creation timestamp */
  created: string;
  /** Last update timestamp */
  updated: string;
  /** Repository information */
  repository: RepositoryInfo;
  /** Sync statistics */
  stats: SyncStats;
  /** Embedding configuration */
  embedding: EmbeddingConfig;
  /** Available node types in this repo */
  nodeTypes: NodeType[];
  /** Available edge types in this repo */
  edgeTypes: EdgeType[];
}

export interface RepositoryInfo {
  /** Unique identifier (hash of remote URL or path) */
  id: string;
  /** Repository name */
  name: string;
  /** Absolute path to repository root */
  root: string;
  /** Git remote URL (if available) */
  remote?: string;
}

export interface SyncStats {
  files: number;
  symbols: number;
  relationships: number;
  vectors: number;
  lastSync: string;
  syncDuration: number;
}

export interface EmbeddingConfig {
  provider: 'openrouter' | 'openai' | 'ollama';
  model: string;
  dimensions: number;
}

// =============================================================================
// Node Types
// =============================================================================

export type NodeType = 'file' | 'symbol' | 'module' | 'commit' | 'prd' | 'devops' | 'test';

export interface BaseNode {
  /** Unique node identifier */
  id: string;
  /** Node type */
  type: NodeType;
}

export interface FileNode extends BaseNode {
  type: 'file';
  path: string;
  language: string;
  size: number;
  hash: string;
  lastModified: string;
}

export interface SymbolNode extends BaseNode {
  type: 'symbol';
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'method' | 'property' | 'enum' | 'namespace';
  name: string;
  file: string;
  line: number;
  endLine?: number;
  complexity?: number;
  docstring?: string;
  signature?: string;
  exported?: boolean;
}

export interface ModuleNode extends BaseNode {
  type: 'module';
  name: string;
  path: string;
  packageJson?: string;
}

export interface CommitNode extends BaseNode {
  type: 'commit';
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  timestamp: string;
  files: string[];
}

export interface PRDNode extends BaseNode {
  type: 'prd';
  name: string;
  file: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  status?: 'draft' | 'approved' | 'implemented' | 'deprecated';
  chunkIds: string[];
}

export interface DevOpsNode extends BaseNode {
  type: 'devops';
  kind: 'pipeline' | 'deployment' | 'environment' | 'secret' | 'artifact';
  name: string;
  trigger?: string;
  status?: 'active' | 'inactive' | 'failed';
  lastRun?: string;
  config?: Record<string, unknown>;
}

export interface TestNode extends BaseNode {
  type: 'test';
  kind: 'unit' | 'integration' | 'e2e' | 'benchmark';
  name: string;
  file: string;
  line: number;
  targets?: string[];  // Symbol IDs being tested
  lastResult?: 'pass' | 'fail' | 'skip';
  lastRun?: string;
}

export type Node = FileNode | SymbolNode | ModuleNode | CommitNode | PRDNode | DevOpsNode | TestNode;

// =============================================================================
// Edge Types
// =============================================================================

export type EdgeType = 'imports' | 'calls' | 'contains' | 'implements' | 'depends' | 'triggers' | 'tests';

export interface BaseEdge {
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** Edge type */
  type: EdgeType;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface ImportEdge extends BaseEdge {
  type: 'imports';
  metadata?: {
    importType?: 'default' | 'named' | 'namespace' | 'side-effect';
    symbols?: string[];
  };
}

export interface CallEdge extends BaseEdge {
  type: 'calls';
  metadata?: {
    line?: number;
    count?: number;
  };
}

export interface ContainsEdge extends BaseEdge {
  type: 'contains';
}

export interface ImplementsEdge extends BaseEdge {
  type: 'implements';
  metadata?: {
    coverage?: number;
    verified?: boolean;
  };
}

export interface DependsEdge extends BaseEdge {
  type: 'depends';
  metadata?: {
    version?: string;
    dev?: boolean;
  };
}

export interface TriggersEdge extends BaseEdge {
  type: 'triggers';
  metadata?: {
    condition?: string;
    automatic?: boolean;
  };
}

export interface TestsEdge extends BaseEdge {
  type: 'tests';
  metadata?: {
    coverage?: number;
  };
}

export type Edge = ImportEdge | CallEdge | ContainsEdge | ImplementsEdge | DependsEdge | TriggersEdge | TestsEdge;

// =============================================================================
// Vector Types
// =============================================================================

export interface VectorEntry {
  /** Unique vector ID */
  id: string;
  /** Original text that was embedded */
  text: string;
  /** Embedding vector (stored as array for JSONL portability) */
  embedding: number[];
  /** Associated metadata */
  metadata: VectorMetadata;
}

export interface VectorMetadata {
  file: string;
  startLine: number;
  endLine: number;
  symbolName?: string;
  language?: string;
  type?: 'code' | 'docstring' | 'commit' | 'prd';
}

// =============================================================================
// Storage Operations
// =============================================================================

export interface StorageOptions {
  /** Path to .cv/ directory */
  cvDir: string;
  /** Whether to compress vector files */
  compressVectors?: boolean;
}

export interface ExportOptions {
  /** Export graph nodes */
  graph?: boolean;
  /** Export vector embeddings */
  vectors?: boolean;
  /** Only export specific node types */
  nodeTypes?: NodeType[];
}

export interface ImportOptions {
  /** Clear existing data before import */
  replace?: boolean;
  /** Merge strategy for conflicts */
  mergeStrategy?: 'overwrite' | 'skip' | 'newest';
}
