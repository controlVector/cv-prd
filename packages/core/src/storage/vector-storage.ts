/**
 * Vector Storage
 *
 * Handles reading/writing vector embeddings to JSONL files
 * in the .cv/vectors/ directory.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { createReadStream } from 'fs';
import { VectorEntry, VectorMetadata } from './types.js';

// =============================================================================
// Directory Structure
// =============================================================================

const VECTORS_DIR = 'vectors';

/**
 * Vector collection types
 */
export type VectorCollection = 'code_chunks' | 'docstrings' | 'commits' | 'prds';

/**
 * Ensure vectors directory exists
 */
export async function ensureVectorDirs(cvDir: string): Promise<void> {
  const vectorsDir = path.join(cvDir, VECTORS_DIR);
  await fs.mkdir(vectorsDir, { recursive: true });
}

/**
 * Get path to a vector collection file
 */
function getVectorFilePath(cvDir: string, collection: VectorCollection): string {
  return path.join(cvDir, VECTORS_DIR, `${collection}.jsonl`);
}

// =============================================================================
// Writing Vectors
// =============================================================================

/**
 * Write vectors to JSONL file
 *
 * Note: Embeddings are stored as JSON arrays. For very large repos,
 * consider implementing binary storage format in future versions.
 */
export async function writeVectors(
  cvDir: string,
  collection: VectorCollection,
  vectors: VectorEntry[]
): Promise<number> {
  await ensureVectorDirs(cvDir);
  const filePath = getVectorFilePath(cvDir, collection);

  const lines = vectors.map(vec => JSON.stringify(vec));
  await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');

  return vectors.length;
}

/**
 * Append vectors to JSONL file
 */
export async function appendVectors(
  cvDir: string,
  collection: VectorCollection,
  vectors: VectorEntry[]
): Promise<void> {
  await ensureVectorDirs(cvDir);
  const filePath = getVectorFilePath(cvDir, collection);

  const lines = vectors.map(vec => JSON.stringify(vec)).join('\n') + '\n';
  await fs.appendFile(filePath, lines, 'utf-8');
}

/**
 * Write vectors in batches (for memory efficiency with large datasets)
 */
export async function writeVectorsBatched(
  cvDir: string,
  collection: VectorCollection,
  vectorGenerator: AsyncGenerator<VectorEntry>,
  batchSize: number = 100
): Promise<number> {
  await ensureVectorDirs(cvDir);
  const filePath = getVectorFilePath(cvDir, collection);

  // Clear existing file
  await fs.writeFile(filePath, '', 'utf-8');

  let batch: VectorEntry[] = [];
  let totalCount = 0;

  for await (const vector of vectorGenerator) {
    batch.push(vector);

    if (batch.length >= batchSize) {
      const lines = batch.map(v => JSON.stringify(v)).join('\n') + '\n';
      await fs.appendFile(filePath, lines, 'utf-8');
      totalCount += batch.length;
      batch = [];
    }
  }

  // Write remaining batch
  if (batch.length > 0) {
    const lines = batch.map(v => JSON.stringify(v)).join('\n') + '\n';
    await fs.appendFile(filePath, lines, 'utf-8');
    totalCount += batch.length;
  }

  return totalCount;
}

// =============================================================================
// Reading Vectors
// =============================================================================

/**
 * Read all vectors from JSONL file
 *
 * Warning: Can be memory-intensive for large repos. Use streamVectors()
 * for memory-efficient access.
 */
export async function readVectors(
  cvDir: string,
  collection: VectorCollection
): Promise<VectorEntry[]> {
  const filePath = getVectorFilePath(cvDir, collection);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);
    return lines.map(line => JSON.parse(line) as VectorEntry);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Stream vectors from JSONL file (memory-efficient)
 */
export async function* streamVectors(
  cvDir: string,
  collection: VectorCollection
): AsyncGenerator<VectorEntry> {
  const filePath = getVectorFilePath(cvDir, collection);

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
      yield JSON.parse(line) as VectorEntry;
    }
  }
}

/**
 * Read vectors with pagination
 */
export async function readVectorsPaginated(
  cvDir: string,
  collection: VectorCollection,
  offset: number = 0,
  limit: number = 100
): Promise<VectorEntry[]> {
  const results: VectorEntry[] = [];
  let currentIndex = 0;

  for await (const vector of streamVectors(cvDir, collection)) {
    if (currentIndex >= offset && results.length < limit) {
      results.push(vector);
    }
    currentIndex++;

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Count vectors in a collection
 */
export async function countVectors(
  cvDir: string,
  collection: VectorCollection
): Promise<number> {
  const filePath = getVectorFilePath(cvDir, collection);

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
 * Clear all vector data
 */
export async function clearVectorStorage(cvDir: string): Promise<void> {
  const vectorsDir = path.join(cvDir, VECTORS_DIR);

  try {
    await fs.rm(vectorsDir, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  await ensureVectorDirs(cvDir);
}

/**
 * Clear a specific collection
 */
export async function clearCollection(
  cvDir: string,
  collection: VectorCollection
): Promise<void> {
  const filePath = getVectorFilePath(cvDir, collection);

  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Get vector storage stats
 */
export async function getVectorStorageStats(cvDir: string): Promise<{
  codeChunks: number;
  docstrings: number;
  commits: number;
  prds: number;
  total: number;
}> {
  const [codeChunks, docstrings, commits, prds] = await Promise.all([
    countVectors(cvDir, 'code_chunks'),
    countVectors(cvDir, 'docstrings'),
    countVectors(cvDir, 'commits'),
    countVectors(cvDir, 'prds')
  ]);

  return {
    codeChunks,
    docstrings,
    commits,
    prds,
    total: codeChunks + docstrings + commits + prds
  };
}

/**
 * Check if vectors exist for a collection
 */
export async function hasVectors(
  cvDir: string,
  collection: VectorCollection
): Promise<boolean> {
  const filePath = getVectorFilePath(cvDir, collection);

  try {
    const stats = await fs.stat(filePath);
    return stats.size > 0;
  } catch {
    return false;
  }
}

/**
 * Get file size of vector collection (in bytes)
 */
export async function getVectorFileSize(
  cvDir: string,
  collection: VectorCollection
): Promise<number> {
  const filePath = getVectorFilePath(cvDir, collection);

  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

// =============================================================================
// Conversion Helpers
// =============================================================================

/**
 * Convert from Qdrant point format to VectorEntry
 */
export function fromQdrantPoint(
  id: string,
  vector: number[],
  payload: Record<string, unknown>
): VectorEntry {
  return {
    id,
    text: (payload.text as string) || '',
    embedding: vector,
    metadata: {
      file: (payload.file as string) || '',
      startLine: (payload.startLine as number) || 0,
      endLine: (payload.endLine as number) || 0,
      symbolName: payload.symbolName as string | undefined,
      language: payload.language as string | undefined,
      type: payload.type as VectorMetadata['type']
    }
  };
}

/**
 * Convert VectorEntry to Qdrant point format
 */
export function toQdrantPoint(entry: VectorEntry): {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
} {
  return {
    id: entry.id,
    vector: entry.embedding,
    payload: {
      text: entry.text,
      ...entry.metadata
    }
  };
}
