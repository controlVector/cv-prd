/**
 * Graph Storage
 *
 * Handles reading/writing graph nodes and edges to JSONL files
 * in the .cv/graph/ directory.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { createReadStream, createWriteStream } from 'fs';
import {
  Node,
  Edge,
  NodeType,
  EdgeType,
  FileNode,
  SymbolNode,
  ImportEdge,
  CallEdge,
  ContainsEdge
} from './types.js';

// =============================================================================
// Directory Structure
// =============================================================================

const GRAPH_DIR = 'graph';
const NODES_DIR = 'nodes';
const EDGES_DIR = 'edges';

/**
 * Ensure graph directory structure exists
 */
export async function ensureGraphDirs(cvDir: string): Promise<void> {
  const graphDir = path.join(cvDir, GRAPH_DIR);
  const nodesDir = path.join(graphDir, NODES_DIR);
  const edgesDir = path.join(graphDir, EDGES_DIR);

  await fs.mkdir(nodesDir, { recursive: true });
  await fs.mkdir(edgesDir, { recursive: true });
}

/**
 * Get path to a node file
 */
function getNodeFilePath(cvDir: string, nodeType: NodeType): string {
  return path.join(cvDir, GRAPH_DIR, NODES_DIR, `${nodeType}s.jsonl`);
}

/**
 * Get path to an edge file
 */
function getEdgeFilePath(cvDir: string, edgeType: EdgeType): string {
  return path.join(cvDir, GRAPH_DIR, EDGES_DIR, `${edgeType}.jsonl`);
}

// =============================================================================
// Writing Nodes
// =============================================================================

/**
 * Write nodes to JSONL file
 */
export async function writeNodes<T extends Node>(
  cvDir: string,
  nodeType: NodeType,
  nodes: T[]
): Promise<number> {
  await ensureGraphDirs(cvDir);
  const filePath = getNodeFilePath(cvDir, nodeType);

  const lines = nodes.map(node => JSON.stringify(node));
  await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');

  return nodes.length;
}

/**
 * Append nodes to JSONL file
 */
export async function appendNodes<T extends Node>(
  cvDir: string,
  nodeType: NodeType,
  nodes: T[]
): Promise<void> {
  await ensureGraphDirs(cvDir);
  const filePath = getNodeFilePath(cvDir, nodeType);

  const lines = nodes.map(node => JSON.stringify(node)).join('\n') + '\n';
  await fs.appendFile(filePath, lines, 'utf-8');
}

/**
 * Write file nodes
 */
export async function writeFileNodes(cvDir: string, files: FileNode[]): Promise<number> {
  return writeNodes(cvDir, 'file', files);
}

/**
 * Write symbol nodes
 */
export async function writeSymbolNodes(cvDir: string, symbols: SymbolNode[]): Promise<number> {
  return writeNodes(cvDir, 'symbol', symbols);
}

// =============================================================================
// Writing Edges
// =============================================================================

/**
 * Write edges to JSONL file
 */
export async function writeEdges<T extends Edge>(
  cvDir: string,
  edgeType: EdgeType,
  edges: T[]
): Promise<number> {
  await ensureGraphDirs(cvDir);
  const filePath = getEdgeFilePath(cvDir, edgeType);

  const lines = edges.map(edge => JSON.stringify(edge));
  await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');

  return edges.length;
}

/**
 * Append edges to JSONL file
 */
export async function appendEdges<T extends Edge>(
  cvDir: string,
  edgeType: EdgeType,
  edges: T[]
): Promise<void> {
  await ensureGraphDirs(cvDir);
  const filePath = getEdgeFilePath(cvDir, edgeType);

  const lines = edges.map(edge => JSON.stringify(edge)).join('\n') + '\n';
  await fs.appendFile(filePath, lines, 'utf-8');
}

/**
 * Write import edges
 */
export async function writeImportEdges(cvDir: string, imports: ImportEdge[]): Promise<number> {
  return writeEdges(cvDir, 'imports', imports);
}

/**
 * Write call edges
 */
export async function writeCallEdges(cvDir: string, calls: CallEdge[]): Promise<number> {
  return writeEdges(cvDir, 'calls', calls);
}

/**
 * Write contains edges
 */
export async function writeContainsEdges(cvDir: string, contains: ContainsEdge[]): Promise<number> {
  return writeEdges(cvDir, 'contains', contains);
}

// =============================================================================
// Reading Nodes
// =============================================================================

/**
 * Read all nodes of a type from JSONL file
 */
export async function readNodes<T extends Node>(
  cvDir: string,
  nodeType: NodeType
): Promise<T[]> {
  const filePath = getNodeFilePath(cvDir, nodeType);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);
    return lines.map(line => JSON.parse(line) as T);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Stream nodes from JSONL file (for large files)
 */
export async function* streamNodes<T extends Node>(
  cvDir: string,
  nodeType: NodeType
): AsyncGenerator<T> {
  const filePath = getNodeFilePath(cvDir, nodeType);

  try {
    await fs.access(filePath);
  } catch {
    return;
  }

  const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim().length > 0) {
      yield JSON.parse(line) as T;
    }
  }
}

/**
 * Read file nodes
 */
export async function readFileNodes(cvDir: string): Promise<FileNode[]> {
  return readNodes<FileNode>(cvDir, 'file');
}

/**
 * Read symbol nodes
 */
export async function readSymbolNodes(cvDir: string): Promise<SymbolNode[]> {
  return readNodes<SymbolNode>(cvDir, 'symbol');
}

// =============================================================================
// Reading Edges
// =============================================================================

/**
 * Read all edges of a type from JSONL file
 */
export async function readEdges<T extends Edge>(
  cvDir: string,
  edgeType: EdgeType
): Promise<T[]> {
  const filePath = getEdgeFilePath(cvDir, edgeType);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);
    return lines.map(line => JSON.parse(line) as T);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Stream edges from JSONL file (for large files)
 */
export async function* streamEdges<T extends Edge>(
  cvDir: string,
  edgeType: EdgeType
): AsyncGenerator<T> {
  const filePath = getEdgeFilePath(cvDir, edgeType);

  try {
    await fs.access(filePath);
  } catch {
    return;
  }

  const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim().length > 0) {
      yield JSON.parse(line) as T;
    }
  }
}

/**
 * Read import edges
 */
export async function readImportEdges(cvDir: string): Promise<ImportEdge[]> {
  return readEdges<ImportEdge>(cvDir, 'imports');
}

/**
 * Read call edges
 */
export async function readCallEdges(cvDir: string): Promise<CallEdge[]> {
  return readEdges<CallEdge>(cvDir, 'calls');
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Count nodes in a file without loading all into memory
 */
export async function countNodes(cvDir: string, nodeType: NodeType): Promise<number> {
  const filePath = getNodeFilePath(cvDir, nodeType);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.trim().split('\n').filter(line => line.length > 0).length;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}

/**
 * Count edges in a file without loading all into memory
 */
export async function countEdges(cvDir: string, edgeType: EdgeType): Promise<number> {
  const filePath = getEdgeFilePath(cvDir, edgeType);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.trim().split('\n').filter(line => line.length > 0).length;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}

/**
 * Clear all graph data
 */
export async function clearGraphStorage(cvDir: string): Promise<void> {
  const graphDir = path.join(cvDir, GRAPH_DIR);

  try {
    await fs.rm(graphDir, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  await ensureGraphDirs(cvDir);
}

/**
 * Get storage stats
 */
export async function getGraphStorageStats(cvDir: string): Promise<{
  files: number;
  symbols: number;
  imports: number;
  calls: number;
  contains: number;
}> {
  const [files, symbols, imports, calls, contains] = await Promise.all([
    countNodes(cvDir, 'file'),
    countNodes(cvDir, 'symbol'),
    countEdges(cvDir, 'imports'),
    countEdges(cvDir, 'calls'),
    countEdges(cvDir, 'contains')
  ]);

  return { files, symbols, imports, calls, contains };
}
