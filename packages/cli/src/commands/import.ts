/**
 * cv import command
 * Import PRD data from cv-prd exports
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  configManager,
  createGraphManager,
  createVectorManager,
  readManifest as readCVManifest
} from '@cv-git/core';
import { findRepoRoot, getCVDir } from '@cv-git/shared';
import { addGlobalOptions, createOutput } from '../utils/output.js';
import { getEmbeddingCredentials } from '../utils/credentials.js';

interface PRDExportManifest {
  version: string;
  format: string;
  exportType: string;
  created: string;
  source: {
    app: string;
    version: string;
    project: string;
  };
  stats: {
    prds: number;
    chunks: number;
    links: number;
    vectors: number;
  };
  embedding?: {
    provider: string;
    model: string;
    dimensions: number;
  };
}

interface PRDNode {
  id: string;
  type: string;
  name: string;
  description?: string;
  priority?: string;
  status?: string;
  chunkIds?: string[];
}

interface ChunkNode {
  id: string;
  type: string;
  prd_id: string;
  chunk_type: string;
  text: string;
  priority?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

interface LinkEdge {
  source: string;
  target: string;
  type: string;
  metadata?: Record<string, any>;
}

interface VectorEntry {
  id: string;
  text: string;
  embedding: number[];
  metadata: Record<string, any>;
}

export function importCommand(): Command {
  const cmd = new Command('import');

  cmd
    .description('Import PRD data from cv-prd export')
    .argument('<path>', 'Path to .cv export directory or zip file')
    .option('--no-vectors', 'Skip importing vector embeddings')
    .option('--replace', 'Replace existing PRD data (default: merge)');

  addGlobalOptions(cmd);

  cmd.action(async (importPath: string, options) => {
    const output = createOutput(options);
    let spinner = output.spinner('Initializing import...').start();

    try {
      // Find repository root
      const repoRoot = await findRepoRoot();
      if (!repoRoot) {
        spinner.fail(chalk.red('Not in a CV-Git repository'));
        console.error(chalk.gray('Run `cv init` first'));
        process.exit(1);
      }

      // Resolve import path
      const absolutePath = path.resolve(importPath);

      // Check if it's a zip file or directory
      let exportDir = absolutePath;
      const stats = await fs.stat(absolutePath);

      if (stats.isFile() && absolutePath.endsWith('.zip')) {
        // Extract zip file
        spinner.text = 'Extracting zip file...';
        const extractDir = path.join(path.dirname(absolutePath), path.basename(absolutePath, '.zip'));
        await extractZip(absolutePath, extractDir);
        exportDir = extractDir;
      }

      // Read manifest
      spinner.text = 'Reading export manifest...';
      const manifestPath = path.join(exportDir, 'manifest.json');

      try {
        await fs.access(manifestPath);
      } catch {
        spinner.fail(chalk.red('Invalid export: manifest.json not found'));
        process.exit(1);
      }

      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest: PRDExportManifest = JSON.parse(manifestContent);

      if (manifest.format !== 'cv-prd-export') {
        spinner.fail(chalk.red(`Unknown export format: ${manifest.format}`));
        process.exit(1);
      }

      spinner.succeed(`Found cv-prd export: ${manifest.stats.prds} PRDs, ${manifest.stats.chunks} chunks`);

      // Load configuration
      const config = await configManager.load(repoRoot);

      // Connect to graph database
      spinner = output.spinner('Connecting to FalkorDB...').start();
      const graph = createGraphManager(config.graph.url, config.graph.database);
      await graph.connect();
      spinner.succeed('Connected to FalkorDB');

      // Import PRD nodes
      spinner = output.spinner('Importing PRD nodes...').start();
      const prdsPath = path.join(exportDir, 'prds', 'nodes.jsonl');
      const prdNodes = await readJsonl<PRDNode>(prdsPath);

      for (const prd of prdNodes) {
        await graph.query(`
          MERGE (p:PRD {id: $id})
          SET p.name = $name,
              p.description = $description,
              p.priority = $priority,
              p.status = $status,
              p.imported_at = timestamp()
        `, {
          id: prd.id.replace('prd:', ''),
          name: prd.name,
          description: prd.description || '',
          priority: prd.priority || 'medium',
          status: prd.status || 'draft'
        });
      }
      spinner.succeed(`Imported ${prdNodes.length} PRD nodes`);

      // Import chunk nodes
      spinner = output.spinner('Importing requirement chunks...').start();
      const chunksPath = path.join(exportDir, 'prds', 'chunks.jsonl');
      const chunkNodes = await readJsonl<ChunkNode>(chunksPath);

      for (const chunk of chunkNodes) {
        await graph.query(`
          MERGE (c:Chunk {id: $id})
          SET c.prd_id = $prd_id,
              c.chunk_type = $chunk_type,
              c.text = $text,
              c.priority = $priority,
              c.tags = $tags,
              c.imported_at = timestamp()
          WITH c
          MATCH (p:PRD {id: $prd_id})
          MERGE (p)-[:HAS_CHUNK]->(c)
        `, {
          id: chunk.id.replace('chunk:', ''),
          prd_id: chunk.prd_id,
          chunk_type: chunk.chunk_type,
          text: chunk.text,
          priority: chunk.priority || 'medium',
          tags: JSON.stringify(chunk.tags || [])
        });
      }
      spinner.succeed(`Imported ${chunkNodes.length} requirement chunks`);

      // Import implementation links
      spinner = output.spinner('Importing implementation links...').start();
      const linksPath = path.join(exportDir, 'prds', 'links.jsonl');
      let linkCount = 0;

      try {
        const linkEdges = await readJsonl<LinkEdge>(linksPath);

        for (const link of linkEdges) {
          // Link might be to a Symbol (from cv-git) or a file:line reference
          const sourceId = link.source;
          const targetId = link.target.replace('chunk:', '');

          await graph.query(`
            MATCH (c:Chunk {id: $chunk_id})
            MERGE (s:Symbol {qualified_name: $symbol_id})
            MERGE (s)-[r:IMPLEMENTS]->(c)
            SET r.file = $file,
                r.line = $line,
                r.verified = $verified
          `, {
            chunk_id: targetId,
            symbol_id: sourceId,
            file: link.metadata?.file || '',
            line: link.metadata?.line || 0,
            verified: link.metadata?.verified || false
          });
          linkCount++;
        }
      } catch (error) {
        // Links file might not exist
      }
      spinner.succeed(`Imported ${linkCount} implementation links`);

      // Import vectors if available and requested
      if (options.vectors && manifest.stats.vectors > 0) {
        spinner = output.spinner('Importing vector embeddings...').start();

        try {
          const embeddingCreds = await getEmbeddingCredentials({
            openRouterKey: config.embedding?.apiKey,
            openaiKey: config.ai?.apiKey
          });

          const vector = createVectorManager({
            url: config.vector.url,
            openrouterApiKey: embeddingCreds.openrouterApiKey,
            openaiApiKey: embeddingCreds.openaiApiKey,
            collections: config.vector.collections
          });

          await vector.connect();

          const vectorsPath = path.join(exportDir, 'vectors', 'prds.jsonl');
          const vectors = await readJsonl<VectorEntry>(vectorsPath);

          // Ensure collection exists
          const dimensions = vectors[0]?.embedding?.length || 1536;
          await vector.ensureCollection('prds', dimensions);

          // Batch upsert
          const points = vectors.map(v => ({
            id: v.id,
            vector: v.embedding,
            payload: {
              text: v.text,
              ...v.metadata
            }
          }));

          await vector.upsertBatch('prds', points);
          await vector.close();

          spinner.succeed(`Imported ${vectors.length} vector embeddings`);
        } catch (error: any) {
          spinner.warn(`Could not import vectors: ${error.message}`);
        }
      }

      // Copy to .cv/imports/ for reference
      const cvDir = getCVDir(repoRoot);
      const importsDir = path.join(cvDir, 'imports');
      await fs.mkdir(importsDir, { recursive: true });

      const importRecord = {
        source: manifest.source,
        imported_at: new Date().toISOString(),
        stats: manifest.stats
      };

      await fs.writeFile(
        path.join(importsDir, `${manifest.source.project}-${Date.now()}.json`),
        JSON.stringify(importRecord, null, 2)
      );

      await graph.close();

      // Summary
      console.log();
      console.log(chalk.green('✔ Import completed successfully'));
      console.log();
      console.log(chalk.cyan('Summary:'));
      console.log(`  PRDs:    ${prdNodes.length}`);
      console.log(`  Chunks:  ${chunkNodes.length}`);
      console.log(`  Links:   ${linkCount}`);
      if (manifest.stats.vectors > 0 && options.vectors) {
        console.log(`  Vectors: ${manifest.stats.vectors}`);
      }
      console.log();
      console.log(chalk.gray('PRD data is now available in the knowledge graph.'));
      console.log(chalk.gray('Run `cv graph stats` to see updated counts.'));

    } catch (error: any) {
      spinner.fail(chalk.red('Import failed'));
      console.error(chalk.red(`Error: ${error.message}`));
      if (process.env.CV_DEBUG) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

  return cmd;
}

/**
 * Read JSONL file and parse each line
 */
async function readJsonl<T>(filepath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
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
 * Extract zip file (simple implementation using Node.js)
 */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  const { execSync } = await import('child_process');

  await fs.mkdir(destDir, { recursive: true });

  // Use system unzip command
  try {
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'pipe' });
  } catch {
    // Try with Node.js if unzip not available
    throw new Error('Could not extract zip file. Please extract manually and provide directory path.');
  }
}
