/**
 * Storage Exporter
 *
 * Exports graph and vector data from FalkorDB/Qdrant to .cv/ files.
 * Called after sync to persist data for portability.
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
import {
  createManifest,
  readManifest,
  writeManifest,
  updateManifestStats,
  addNodeTypes,
  addEdgeTypes
} from './manifest.js';
import {
  ensureGraphDirs,
  writeFileNodes,
  writeSymbolNodes,
  writeImportEdges,
  writeCallEdges,
  writeContainsEdges
} from './graph-storage.js';
import {
  ensureVectorDirs,
  writeVectors,
  VectorCollection
} from './vector-storage.js';
import { getRepositoryInfo } from './repo-id.js';

export interface ExportResult {
  manifest: StorageManifest;
  stats: {
    files: number;
    symbols: number;
    imports: number;
    calls: number;
    contains: number;
    vectors: number;
  };
  duration: number;
}

/**
 * Export graph and vector data to .cv/ files
 */
export async function exportToStorage(
  repoRoot: string,
  graph: GraphManager,
  vector?: VectorManager,
  embeddingConfig?: { provider: string; model: string; dimensions: number }
): Promise<ExportResult> {
  const startTime = Date.now();
  const cvDir = getCVDir(repoRoot);

  // Ensure directories exist
  await ensureGraphDirs(cvDir);
  await ensureVectorDirs(cvDir);

  // Load or create manifest
  let manifest = await readManifest(cvDir);
  if (!manifest) {
    manifest = createManifest(repoRoot, embeddingConfig as any);
  }

  const stats = {
    files: 0,
    symbols: 0,
    imports: 0,
    calls: 0,
    contains: 0,
    vectors: 0
  };

  // Export file nodes
  console.log('Exporting file nodes...');
  const fileNodes = await exportFileNodes(graph);
  stats.files = await writeFileNodes(cvDir, fileNodes);

  // Export symbol nodes
  console.log('Exporting symbol nodes...');
  const symbolNodes = await exportSymbolNodes(graph);
  stats.symbols = await writeSymbolNodes(cvDir, symbolNodes);

  // Export edges
  console.log('Exporting relationships...');
  const { imports, calls, contains } = await exportEdges(graph);
  stats.imports = await writeImportEdges(cvDir, imports);
  stats.calls = await writeCallEdges(cvDir, calls);
  stats.contains = await writeContainsEdges(cvDir, contains);

  // Export vectors if available
  if (vector && vector.isConnected()) {
    console.log('Exporting vector embeddings...');
    stats.vectors = await exportVectors(cvDir, vector);
  }

  // Update manifest
  manifest = updateManifestStats(manifest, {
    files: stats.files,
    symbols: stats.symbols,
    relationships: stats.imports + stats.calls + stats.contains,
    vectors: stats.vectors,
    syncDuration: (Date.now() - startTime) / 1000
  });

  manifest = addNodeTypes(manifest, ['file', 'symbol']);
  manifest = addEdgeTypes(manifest, ['imports', 'calls', 'contains']);

  await writeManifest(cvDir, manifest);

  const duration = (Date.now() - startTime) / 1000;
  console.log(`Export completed in ${duration.toFixed(2)}s`);

  return { manifest, stats, duration };
}

/**
 * Export file nodes from graph
 */
async function exportFileNodes(graph: GraphManager): Promise<FileNode[]> {
  const query = `
    MATCH (f:File)
    RETURN f.path as path,
           f.language as language,
           f.size as size,
           f.gitHash as hash,
           f.lastModified as lastModified
  `;

  const result = await graph.query(query);
  const nodes: FileNode[] = [];

  for (const row of result) {
    // Handle lastModified - might be timestamp (ms), ISO string, or null
    let lastModified: string;
    if (!row.lastModified) {
      lastModified = new Date().toISOString();
    } else if (typeof row.lastModified === 'number') {
      lastModified = new Date(row.lastModified).toISOString();
    } else if (typeof row.lastModified === 'string') {
      // Already a string, validate it's a valid date
      const d = new Date(row.lastModified);
      lastModified = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    } else {
      lastModified = new Date().toISOString();
    }

    nodes.push({
      id: `file:${row.path}`,
      type: 'file',
      path: row.path,
      language: row.language || 'unknown',
      size: row.size || 0,
      hash: row.hash || '',
      lastModified
    });
  }

  return nodes;
}

/**
 * Export symbol nodes from graph
 */
async function exportSymbolNodes(graph: GraphManager): Promise<SymbolNode[]> {
  const query = `
    MATCH (s:Symbol)
    RETURN s.qualifiedName as qualifiedName,
           s.name as name,
           s.kind as kind,
           s.file as file,
           s.startLine as line,
           s.endLine as endLine,
           s.complexity as complexity,
           s.docstring as docstring,
           s.signature as signature,
           s.exported as exported
  `;

  const result = await graph.query(query);
  const nodes: SymbolNode[] = [];

  for (const row of result) {
    nodes.push({
      id: `sym:${row.qualifiedName}`,
      type: 'symbol',
      kind: row.kind || 'function',
      name: row.name,
      file: row.file,
      line: row.line || 0,
      endLine: row.endLine,
      complexity: row.complexity,
      docstring: row.docstring,
      signature: row.signature,
      exported: row.exported
    });
  }

  return nodes;
}

/**
 * Export edges from graph
 */
async function exportEdges(graph: GraphManager): Promise<{
  imports: ImportEdge[];
  calls: CallEdge[];
  contains: ContainsEdge[];
}> {
  const imports: ImportEdge[] = [];
  const calls: CallEdge[] = [];
  const contains: ContainsEdge[] = [];

  // Export IMPORTS edges
  const importsQuery = `
    MATCH (f1:File)-[r:IMPORTS]->(f2:File)
    RETURN f1.path as source, f2.path as target, r.line as line, r.importedSymbols as symbols
  `;
  const importsResult = await graph.query(importsQuery);

  for (const row of importsResult) {
    imports.push({
      source: `file:${row.source}`,
      target: `file:${row.target}`,
      type: 'imports',
      metadata: {
        symbols: row.symbols
      }
    });
  }

  // Export CALLS edges
  const callsQuery = `
    MATCH (s1:Symbol)-[r:CALLS]->(s2:Symbol)
    RETURN s1.qualifiedName as source, s2.qualifiedName as target, r.line as line, r.callCount as count
  `;
  const callsResult = await graph.query(callsQuery);

  for (const row of callsResult) {
    calls.push({
      source: `sym:${row.source}`,
      target: `sym:${row.target}`,
      type: 'calls',
      metadata: {
        line: row.line,
        count: row.count
      }
    });
  }

  // Export DEFINES (contains) edges
  const containsQuery = `
    MATCH (f:File)-[r:DEFINES]->(s:Symbol)
    RETURN f.path as source, s.qualifiedName as target, r.line as line
  `;
  const containsResult = await graph.query(containsQuery);

  for (const row of containsResult) {
    contains.push({
      source: `file:${row.source}`,
      target: `sym:${row.target}`,
      type: 'contains'
    });
  }

  return { imports, calls, contains };
}

/**
 * Export vectors from Qdrant to files
 */
async function exportVectors(cvDir: string, vector: VectorManager): Promise<number> {
  let totalVectors = 0;

  // Export code chunks
  try {
    const codeChunks = await exportVectorCollection(vector, 'code_chunks');
    if (codeChunks.length > 0) {
      await writeVectors(cvDir, 'code_chunks', codeChunks);
      totalVectors += codeChunks.length;
      console.log(`  Exported ${codeChunks.length} code chunk vectors`);
    }
  } catch (error: any) {
    console.log(`  No code chunks to export: ${error.message}`);
  }

  // Export docstrings
  try {
    const docstrings = await exportVectorCollection(vector, 'docstrings');
    if (docstrings.length > 0) {
      await writeVectors(cvDir, 'docstrings', docstrings);
      totalVectors += docstrings.length;
      console.log(`  Exported ${docstrings.length} docstring vectors`);
    }
  } catch (error: any) {
    // Docstrings collection might not exist
  }

  // Export commits
  try {
    const commits = await exportVectorCollection(vector, 'commits');
    if (commits.length > 0) {
      await writeVectors(cvDir, 'commits', commits);
      totalVectors += commits.length;
      console.log(`  Exported ${commits.length} commit vectors`);
    }
  } catch (error: any) {
    // Commits collection might not exist
  }

  return totalVectors;
}

/**
 * Export a single vector collection
 */
async function exportVectorCollection(
  vector: VectorManager,
  collection: string
): Promise<VectorEntry[]> {
  // Use scroll to get all vectors
  const entries: VectorEntry[] = [];
  const batchSize = 100;
  let offset: string | undefined;

  while (true) {
    const result = await vector.scroll(collection, batchSize, offset);

    if (!result.points || result.points.length === 0) {
      break;
    }

    for (const point of result.points) {
      entries.push({
        id: String(point.id),
        text: (point.payload?.text as string) || '',
        embedding: point.vector as number[],
        metadata: {
          file: (point.payload?.file as string) || '',
          startLine: (point.payload?.startLine as number) || 0,
          endLine: (point.payload?.endLine as number) || 0,
          symbolName: point.payload?.symbolName as string,
          language: point.payload?.language as string,
          type: 'code'
        }
      });
    }

    offset = result.next_page_offset;
    if (!offset) break;
  }

  return entries;
}
