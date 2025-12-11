/**
 * Storage Loader
 *
 * Loads graph and vector data from .cv/ files into FalkorDB/Qdrant.
 * Used for auto-loading when entering a repository.
 */

import * as path from 'path';
import { getCVDir } from '@cv-git/shared';
import { GraphManager } from '../graph/index.js';
import { VectorManager } from '../vector/index.js';
import {
  StorageManifest,
  FileNode,
  SymbolNode,
  ImportEdge,
  CallEdge,
  ContainsEdge,
  VectorEntry
} from './types.js';
import { readManifest } from './manifest.js';
import {
  readFileNodes,
  readSymbolNodes,
  readImportEdges,
  readCallEdges
} from './graph-storage.js';
import {
  readVectors,
  streamVectors,
  VectorCollection
} from './vector-storage.js';
import {
  generateRepoId,
  getGraphDatabaseName,
  getVectorCollectionName
} from './repo-id.js';

export interface LoadResult {
  manifest: StorageManifest;
  stats: {
    files: number;
    symbols: number;
    imports: number;
    calls: number;
    vectors: number;
  };
  duration: number;
}

export interface LoadOptions {
  /** Clear existing data before loading */
  replace?: boolean;
  /** Skip vector loading (faster) */
  skipVectors?: boolean;
  /** Use repo-specific database/collections */
  isolateByRepo?: boolean;
}

/**
 * Check if repository data is already loaded in databases
 */
export async function isRepoLoaded(
  repoRoot: string,
  graph: GraphManager
): Promise<boolean> {
  const repoId = generateRepoId(repoRoot);

  try {
    // Check if we have any files from this repo
    const result = await graph.query(`
      MATCH (f:File)
      WHERE f.repoId = '${repoId}'
      RETURN count(f) as count
      LIMIT 1
    `);

    return result.length > 0 && result[0].count > 0;
  } catch {
    return false;
  }
}

/**
 * Load graph and vector data from .cv/ files
 */
export async function loadFromStorage(
  repoRoot: string,
  graph: GraphManager,
  vector?: VectorManager,
  options: LoadOptions = {}
): Promise<LoadResult> {
  const startTime = Date.now();
  const cvDir = getCVDir(repoRoot);

  // Read manifest
  const manifest = await readManifest(cvDir);
  if (!manifest) {
    throw new Error(`No manifest found in ${cvDir}. Run 'cv sync' first.`);
  }

  const repoId = manifest.repository.id;
  const stats = {
    files: 0,
    symbols: 0,
    imports: 0,
    calls: 0,
    vectors: 0
  };

  // Clear existing data if requested
  if (options.replace) {
    console.log('Clearing existing graph data...');
    await graph.clear();
  }

  // Load file nodes
  console.log('Loading file nodes...');
  const fileNodes = await readFileNodes(cvDir);
  for (const node of fileNodes) {
    await graph.query(`
      MERGE (f:File {path: $path})
      SET f.language = $language,
          f.size = $size,
          f.gitHash = $hash,
          f.lastModified = $lastModified,
          f.repoId = $repoId
    `, {
      path: node.path,
      language: node.language,
      size: node.size,
      hash: node.hash,
      lastModified: node.lastModified,
      repoId
    });
    stats.files++;
  }

  // Load symbol nodes
  console.log('Loading symbol nodes...');
  const symbolNodes = await readSymbolNodes(cvDir);
  for (const node of symbolNodes) {
    await graph.query(`
      MERGE (s:Symbol {qualifiedName: $qualifiedName})
      SET s.name = $name,
          s.kind = $kind,
          s.file = $file,
          s.startLine = $line,
          s.endLine = $endLine,
          s.complexity = $complexity,
          s.docstring = $docstring,
          s.signature = $signature,
          s.exported = $exported,
          s.repoId = $repoId
    `, {
      qualifiedName: node.id.replace('sym:', ''),
      name: node.name,
      kind: node.kind,
      file: node.file,
      line: node.line,
      endLine: node.endLine || null,
      complexity: node.complexity || 0,
      docstring: node.docstring || '',
      signature: node.signature || '',
      exported: node.exported || false,
      repoId
    });
    stats.symbols++;
  }

  // Load edges
  console.log('Loading relationships...');

  // Import edges
  const importEdges = await readImportEdges(cvDir);
  for (const edge of importEdges) {
    const sourcePath = edge.source.replace('file:', '');
    const targetPath = edge.target.replace('file:', '');
    await graph.query(`
      MATCH (f1:File {path: $source}), (f2:File {path: $target})
      MERGE (f1)-[r:IMPORTS]->(f2)
    `, {
      source: sourcePath,
      target: targetPath
    });
    stats.imports++;
  }

  // Call edges
  const callEdges = await readCallEdges(cvDir);
  for (const edge of callEdges) {
    const sourceQN = edge.source.replace('sym:', '');
    const targetQN = edge.target.replace('sym:', '');
    await graph.query(`
      MATCH (s1:Symbol {qualifiedName: $source}), (s2:Symbol {qualifiedName: $target})
      MERGE (s1)-[r:CALLS]->(s2)
      SET r.line = $line, r.callCount = $count
    `, {
      source: sourceQN,
      target: targetQN,
      line: edge.metadata?.line || 0,
      count: edge.metadata?.count || 1
    });
    stats.calls++;
  }

  // Load vectors if available
  if (vector && vector.isConnected() && !options.skipVectors) {
    console.log('Loading vector embeddings...');
    stats.vectors = await loadVectors(cvDir, vector, repoId, options.isolateByRepo);
  }

  const duration = (Date.now() - startTime) / 1000;
  console.log(`Load completed in ${duration.toFixed(2)}s`);

  return { manifest, stats, duration };
}

/**
 * Load vectors from files into Qdrant
 */
async function loadVectors(
  cvDir: string,
  vector: VectorManager,
  repoId: string,
  isolateByRepo: boolean = false,
  vectorSize: number = 1536
): Promise<number> {
  let totalVectors = 0;

  // Load code chunks
  try {
    const codeChunks = await readVectors(cvDir, 'code_chunks');
    if (codeChunks.length > 0) {
      const collectionName = isolateByRepo
        ? getVectorCollectionName(repoId, 'code_chunks')
        : 'code_chunks';

      // Ensure collection exists (use dimensions from first entry or default)
      const dimensions = codeChunks[0]?.embedding?.length || vectorSize;
      await vector.ensureCollection(collectionName, dimensions);

      // Batch upsert
      const points = codeChunks.map(entry => ({
        id: entry.id,
        vector: entry.embedding,
        payload: {
          text: entry.text,
          ...entry.metadata,
          repoId
        }
      }));

      await vector.upsertBatch(collectionName, points);
      totalVectors += codeChunks.length;
      console.log(`  Loaded ${codeChunks.length} code chunk vectors`);
    }
  } catch (error: any) {
    console.log(`  No code chunks to load: ${error.message}`);
  }

  return totalVectors;
}

/**
 * Load only vectors (for when graph is already in DB)
 */
export async function loadVectorsOnly(
  repoRoot: string,
  vector: VectorManager,
  options: LoadOptions = {}
): Promise<number> {
  const cvDir = getCVDir(repoRoot);
  const manifest = await readManifest(cvDir);
  if (!manifest) {
    throw new Error(`No manifest found in ${cvDir}`);
  }

  return loadVectors(cvDir, vector, manifest.repository.id, options.isolateByRepo);
}

/**
 * Get manifest info without loading
 */
export async function getStorageInfo(repoRoot: string): Promise<StorageManifest | null> {
  const cvDir = getCVDir(repoRoot);
  return readManifest(cvDir);
}
