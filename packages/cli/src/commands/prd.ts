/**
 * cv prd - PRD (Product Requirements Document) management
 *
 * Supports two modes:
 * 1. File mode: .cvprd/ directory in repo (local-first, portable)
 * 2. API mode: Connect to cv-prd backend server
 *
 * Usage:
 *   cv prd init                    Initialize .cvprd/ in current repo
 *   cv prd add <file>              Add a PRD markdown file
 *   cv prd list                    List PRDs
 *   cv prd show <prd-id>           Show PRD details
 *   cv prd find <query>            Semantic search in requirements
 *   cv prd sync                    Sync PRDs to graph + vectors
 *   cv prd link <chunk-id> <file:line>  Link code to requirement
 *   cv prd coverage                Show requirement coverage
 */

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { PRDClient } from '@cv-git/prd-client';
import {
  configManager,
  createVectorManager,
  createGraphManager,
  VectorManager,
  GraphManager,
} from '@cv-git/core';
import { discoverCvPrd } from '../utils/services.js';

/**
 * Find git repository root by looking for .git directory
 */
async function findGitRoot(startDir: string = process.cwd()): Promise<string | null> {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    try {
      const gitDir = path.join(currentDir, '.git');
      const stat = await fs.stat(gitDir);
      if (stat.isDirectory()) {
        return currentDir;
      }
    } catch {
      // .git doesn't exist, continue
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

// Types for PRD-as-files
interface PRDManifest {
  version: string;
  created: string;
  updated: string;
  repository: {
    name: string;
    remote?: string;
  };
  prds: PRDEntry[];
  stats: {
    total_chunks: number;
    total_embeddings: number;
    linked_symbols: number;
    coverage_percent: number;
  };
  embedding_model: {
    provider: string;
    model: string;
    dimensions: number;
  };
  graph_version: string;
}

interface PRDEntry {
  id: string;
  file: string;
  name: string;
  status: string;
  chunks: number;
  coverage: number;
}

interface PRDChunk {
  id: string;
  prd_id: string;
  text: string;
  type: string;
  priority?: string;
  depends?: string[];
  implements?: string;
  line_start: number;
  line_end: number;
}

interface ParsedPRD {
  id: string;
  name: string;
  version?: string;
  status: string;
  owner?: string;
  tags: string[];
  chunks: PRDChunk[];
  raw_content: string;
}

export function createPRDCommand(): Command {
  const prd = new Command('prd')
    .description('PRD (Product Requirements Document) management');

  // ═══════════════════════════════════════════════════════════════
  // cv prd init
  // ═══════════════════════════════════════════════════════════════
  prd
    .command('init')
    .description('Initialize .cvprd/ directory in current repository')
    .option('--api <url>', 'Connect to cv-prd API instead of file mode')
    .action(async (options) => {
      const spinner = ora('Initializing PRD directory...').start();

      try {
        const repoRoot = await findGitRoot();
        if (!repoRoot) {
          spinner.fail('Not in a git repository');
          return;
        }

        const prdDir = path.join(repoRoot, '.cvprd');

        // Check if already initialized
        if (await fileExists(path.join(prdDir, 'manifest.json'))) {
          spinner.info('PRD directory already initialized');
          return;
        }

        // Create directory structure
        await fs.mkdir(prdDir, { recursive: true });
        await fs.mkdir(path.join(prdDir, 'prds'), { recursive: true });
        await fs.mkdir(path.join(prdDir, 'graph'), { recursive: true });
        await fs.mkdir(path.join(prdDir, 'vectors'), { recursive: true });
        await fs.mkdir(path.join(prdDir, 'links'), { recursive: true });

        // Get repo name from git
        const repoName = path.basename(repoRoot);

        // Create manifest
        const manifest: PRDManifest = {
          version: '1.0.0',
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          repository: {
            name: repoName
          },
          prds: [],
          stats: {
            total_chunks: 0,
            total_embeddings: 0,
            linked_symbols: 0,
            coverage_percent: 0
          },
          embedding_model: {
            provider: 'openai',
            model: 'text-embedding-3-small',
            dimensions: 1536
          },
          graph_version: 'falkordb-v1'
        };

        await fs.writeFile(
          path.join(prdDir, 'manifest.json'),
          JSON.stringify(manifest, null, 2)
        );

        // Create .gitignore for large files
        await fs.writeFile(
          path.join(prdDir, '.gitignore'),
          '# Large binary files (regenerated on sync)\nvectors/embeddings.bin\n'
        );

        // Create graph schema
        const schema = {
          version: '1.0.0',
          node_types: {
            PRD: ['id', 'name', 'status', 'file', 'created', 'updated'],
            Chunk: ['id', 'prd_id', 'text', 'priority', 'chunk_type', 'vector_id'],
            Symbol: ['id', 'name', 'file', 'line', 'kind']
          },
          edge_types: {
            BELONGS_TO: { from: 'Chunk', to: 'PRD' },
            DEPENDS_ON: { from: 'Chunk', to: 'Chunk' },
            REFERENCES: { from: 'Chunk', to: 'Chunk' },
            IMPLEMENTS: { from: 'Symbol', to: 'Chunk' }
          }
        };

        await fs.writeFile(
          path.join(prdDir, 'graph', 'schema.json'),
          JSON.stringify(schema, null, 2)
        );

        // Create empty JSONL files
        await fs.writeFile(path.join(prdDir, 'graph', 'nodes.jsonl'), '');
        await fs.writeFile(path.join(prdDir, 'graph', 'edges.jsonl'), '');
        await fs.writeFile(path.join(prdDir, 'vectors', 'metadata.jsonl'), '');
        await fs.writeFile(path.join(prdDir, 'links', 'implementations.jsonl'), '');
        await fs.writeFile(
          path.join(prdDir, 'links', 'coverage.json'),
          JSON.stringify({ coverage: {}, updated: new Date().toISOString() }, null, 2)
        );

        spinner.succeed(`Initialized .cvprd/ in ${repoRoot}`);

        console.log('\nNext steps:');
        console.log('  cv prd add <requirements.md>   Add a PRD document');
        console.log('  cv prd sync                    Sync to graph + vectors');
        console.log('  cv prd find "query"            Search requirements');
      } catch (error) {
        spinner.fail(`Failed to initialize: ${error}`);
      }
    });

  // ═══════════════════════════════════════════════════════════════
  // cv prd add
  // ═══════════════════════════════════════════════════════════════
  prd
    .command('add <file>')
    .description('Add a PRD markdown file')
    .option('--id <id>', 'Override PRD ID (default: derived from filename)')
    .action(async (file, options) => {
      const spinner = ora('Adding PRD...').start();

      try {
        const repoRoot = await findGitRoot();
        if (!repoRoot) {
          spinner.fail('Not in a git repository');
          return;
        }

        const prdDir = path.join(repoRoot, '.cvprd');

        // Check if initialized
        if (!(await fileExists(path.join(prdDir, 'manifest.json')))) {
          spinner.fail('PRD not initialized. Run: cv prd init');
          return;
        }

        // Read source file
        const sourcePath = path.resolve(file);
        if (!(await fileExists(sourcePath))) {
          spinner.fail(`File not found: ${sourcePath}`);
          return;
        }

        const content = await fs.readFile(sourcePath, 'utf-8');
        const parsed = parsePRDMarkdown(content, options.id || path.basename(file, '.md'));

        // Copy to prds directory
        const destFile = `${parsed.id}.md`;
        const destPath = path.join(prdDir, 'prds', destFile);
        await fs.writeFile(destPath, content);

        // Update manifest
        const manifest = await loadManifest(prdDir);
        const existingIndex = manifest.prds.findIndex(p => p.id === parsed.id);

        const entry: PRDEntry = {
          id: parsed.id,
          file: `prds/${destFile}`,
          name: parsed.name,
          status: parsed.status,
          chunks: parsed.chunks.length,
          coverage: 0
        };

        if (existingIndex >= 0) {
          manifest.prds[existingIndex] = entry;
        } else {
          manifest.prds.push(entry);
        }

        manifest.updated = new Date().toISOString();
        manifest.stats.total_chunks = manifest.prds.reduce((sum, p) => sum + p.chunks, 0);

        await saveManifest(prdDir, manifest);

        // Append nodes to graph
        await appendGraphNodes(prdDir, parsed);

        spinner.succeed(`Added PRD: ${parsed.name} (${parsed.chunks.length} chunks)`);

        console.log('\nRun `cv prd sync` to generate embeddings and update the graph database.');
      } catch (error) {
        spinner.fail(`Failed to add PRD: ${error}`);
      }
    });

  // ═══════════════════════════════════════════════════════════════
  // cv prd list
  // ═══════════════════════════════════════════════════════════════
  prd
    .command('list')
    .description('List PRDs in current repository')
    .option('--api', 'List from cv-prd API instead of local files')
    .option('--graph', 'List from knowledge graph (imported data)')
    .action(async (options) => {
      try {
        const repoRoot = await findGitRoot();
        if (!repoRoot) {
          console.log(chalk.red('Not in a git repository'));
          return;
        }

        const prdDir = path.join(repoRoot, '.cvprd');

        if (options.graph) {
          // Graph mode - query FalkorDB for imported PRD data
          const config = await configManager.load(repoRoot);
          const graphUrl = config.graph?.url || 'redis://localhost:6379';
          const graph = createGraphManager(graphUrl, config.graph.database);

          await graph.connect();

          const result = await graph.query(`
            MATCH (p:PRD)
            OPTIONAL MATCH (p)-[:HAS_CHUNK]->(c:Chunk)
            RETURN p.id as id, p.name as name, p.description as description,
                   p.status as status, count(c) as chunk_count
            ORDER BY p.name
          `);

          await graph.close();

          if (result.length === 0) {
            console.log(chalk.yellow('No PRDs in knowledge graph. Run: cv import <path>'));
            return;
          }

          console.log(chalk.bold('\nPRDs in Knowledge Graph:\n'));
          for (const row of result) {
            console.log(`  ${chalk.cyan(row.id)} - ${row.name}`);
            if (row.description) {
              console.log(`    ${chalk.gray(row.description.substring(0, 80))}...`);
            }
            console.log(`    Chunks: ${row.chunk_count}, Status: ${row.status || 'imported'}`);
            console.log();
          }

          console.log(chalk.gray(`  Total: ${result.length} PRDs`));
        } else if (options.api) {
          // API mode
          const config = await configManager.load(repoRoot);
          const apiUrl = (config as any).prd?.apiUrl || 'http://localhost:8000';
          const client = new PRDClient({
            baseUrl: apiUrl
          });

          if (!(await client.isAvailable())) {
            console.log(chalk.yellow('cv-prd API not available'));
            return;
          }

          const prds = await client.listPRDs();
          console.log(chalk.bold('\nPRDs from cv-prd API:\n'));
          for (const prd of prds) {
            console.log(`  ${chalk.cyan(prd.id)} - ${prd.name}`);
            console.log(`    Status: ${prd.status}`);
          }
        } else {
          // File mode - but also check graph if no .cvprd directory
          if (!(await fileExists(path.join(prdDir, 'manifest.json')))) {
            // Try graph mode as fallback
            try {
              const config = await configManager.load(repoRoot);
              const graphUrl = config.graph?.url || 'redis://localhost:6379';
              const graph = createGraphManager(graphUrl, config.graph.database);

              await graph.connect();

              const result = await graph.query(`
                MATCH (p:PRD) RETURN count(p) as count
              `);

              await graph.close();

              if (result.length > 0 && result[0].count > 0) {
                console.log(chalk.yellow('No .cvprd/ directory, but PRDs found in graph.'));
                console.log(chalk.gray('Use: cv prd list --graph'));
                return;
              }
            } catch {
              // Graph not available
            }
            console.log(chalk.yellow('No .cvprd/ directory. Run: cv prd init'));
            return;
          }

          const manifest = await loadManifest(prdDir);

          if (manifest.prds.length === 0) {
            console.log(chalk.yellow('No PRDs found. Run: cv prd add <file.md>'));
            return;
          }

          console.log(chalk.bold('\nPRDs in repository:\n'));
          for (const prd of manifest.prds) {
            const coverageColor = prd.coverage >= 0.7 ? chalk.green :
              prd.coverage >= 0.4 ? chalk.yellow : chalk.red;

            console.log(`  ${chalk.cyan(prd.id)} - ${prd.name}`);
            console.log(`    Status: ${prd.status}, Chunks: ${prd.chunks}, Coverage: ${coverageColor(`${(prd.coverage * 100).toFixed(0)}%`)}`);
          }

          console.log(chalk.gray(`\n  Total: ${manifest.prds.length} PRDs, ${manifest.stats.total_chunks} chunks`));
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error}`));
      }
    });

  // ═══════════════════════════════════════════════════════════════
  // cv prd show
  // ═══════════════════════════════════════════════════════════════
  prd
    .command('show <prd-id>')
    .description('Show PRD details')
    .option('--chunks', 'Show all chunks')
    .option('--graph', 'Show from knowledge graph (imported data)')
    .action(async (prdId, options) => {
      try {
        const repoRoot = await findGitRoot();
        if (!repoRoot) {
          console.log(chalk.red('Not in a git repository'));
          return;
        }

        if (options.graph) {
          // Graph mode - query FalkorDB for PRD and its chunks
          const config = await configManager.load(repoRoot);
          const graphUrl = config.graph?.url || 'redis://localhost:6379';
          const graph = createGraphManager(graphUrl, config.graph.database);

          await graph.connect();

          // Get PRD details
          const prdResult = await graph.query(`
            MATCH (p:PRD {id: $id})
            RETURN p.name as name, p.description as description, p.status as status
          `, { id: prdId });

          if (prdResult.length === 0) {
            await graph.close();
            console.log(chalk.red(`PRD not found in graph: ${prdId}`));
            return;
          }

          const prd = prdResult[0];
          console.log(chalk.bold(`\n${prd.name}`));
          console.log(chalk.gray(`ID: ${prdId}`));
          if (prd.description) {
            console.log(`\n${prd.description}`);
          }
          console.log(`\nStatus: ${prd.status || 'imported'}`);

          // Get chunks
          const chunkResult = await graph.query(`
            MATCH (c:Chunk {prd_id: $prd_id})
            OPTIONAL MATCH (s:Symbol)-[:IMPLEMENTS]->(c)
            RETURN c.id as id, c.text as text, c.priority as priority,
                   c.chunk_type as type, count(s) as impl_count
            ORDER BY c.priority DESC, c.id
          `, { prd_id: prdId });

          await graph.close();

          console.log(chalk.bold(`\nRequirements (${chunkResult.length} chunks):`));
          console.log();

          for (const chunk of chunkResult) {
            const priorityColor = chunk.priority === 'critical' ? chalk.red :
              chunk.priority === 'high' ? chalk.yellow : chalk.gray;
            const implStatus = chunk.impl_count > 0 ? chalk.green('✓') : chalk.gray('○');

            console.log(`  ${implStatus} ${chalk.cyan(chunk.id)} [${priorityColor(chunk.priority || 'medium')}]`);
            if (options.chunks) {
              console.log(`     ${chunk.text}`);
            } else {
              console.log(`     ${(chunk.text || '').substring(0, 100)}...`);
            }
            console.log();
          }
          return;
        }

        const prdDir = path.join(repoRoot, '.cvprd');

        const manifest = await loadManifest(prdDir);
        const entry = manifest.prds.find(p => p.id === prdId);

        if (!entry) {
          console.log(chalk.red(`PRD not found: ${prdId}`));
          return;
        }

        // Read PRD content
        const content = await fs.readFile(path.join(repoRoot, '.cvprd', entry.file), 'utf-8');
        const parsed = parsePRDMarkdown(content, prdId);

        console.log(chalk.bold(`\n${parsed.name}`));
        console.log(chalk.gray(`ID: ${parsed.id}`));
        console.log(`Status: ${parsed.status}`);
        if (parsed.tags.length > 0) {
          console.log(`Tags: ${parsed.tags.join(', ')}`);
        }
        console.log(`Chunks: ${parsed.chunks.length}`);
        console.log(`Coverage: ${(entry.coverage * 100).toFixed(0)}%`);

        if (options.chunks) {
          console.log(chalk.bold('\nChunks:\n'));
          for (const chunk of parsed.chunks) {
            const priorityColor = chunk.priority === 'high' ? chalk.red :
              chunk.priority === 'medium' ? chalk.yellow : chalk.gray;

            console.log(`  ${chalk.cyan(chunk.id)} [${chunk.type}] ${priorityColor(chunk.priority || 'normal')}`);
            console.log(`    ${chunk.text.substring(0, 100)}...`);
            if (chunk.depends && chunk.depends.length > 0) {
              console.log(chalk.gray(`    Depends on: ${chunk.depends.join(', ')}`));
            }
            console.log();
          }
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error}`));
      }
    });

  // ═══════════════════════════════════════════════════════════════
  // cv prd find
  // ═══════════════════════════════════════════════════════════════
  prd
    .command('find <query>')
    .description('Semantic search in requirements')
    .option('-n, --limit <n>', 'Number of results', '10')
    .option('--type <type>', 'Filter by chunk type (functional, security, etc)')
    .option('--priority <priority>', 'Filter by priority (critical, high, medium, low)')
    .option('--api', 'Search via cv-prd API')
    .option('--graph', 'Search imported PRD chunks (default if no .cvprd/)')
    .action(async (query, options) => {
      const spinner = ora('Searching requirements...').start();

      try {
        const repoRoot = await findGitRoot();
        if (!repoRoot) {
          spinner.fail('Not in a git repository');
          return;
        }

        const config = await configManager.load(repoRoot);
        const prdDir = path.join(repoRoot, '.cvprd');
        const hasLocalPrds = await fileExists(path.join(prdDir, 'manifest.json'));

        // Auto-select graph mode if no local .cvprd/ and not using --api
        const useGraph = options.graph || (!hasLocalPrds && !options.api);

        if (options.api) {
          // API mode
          const apiUrl = (config as any).prd?.apiUrl || 'http://localhost:8000';
          const client = new PRDClient({
            baseUrl: apiUrl
          });

          if (!(await client.isAvailable())) {
            spinner.fail('cv-prd API not available');
            return;
          }

          const results = await client.search({
            query,
            limit: parseInt(options.limit),
            filters: {
              chunk_type: options.type ? [options.type] : undefined,
              priority: options.priority ? [options.priority] : undefined
            }
          });

          spinner.stop();

          if (results.length === 0) {
            console.log(chalk.yellow('No matching requirements found'));
            return;
          }

          console.log(chalk.bold(`\nFound ${results.length} requirements:\n`));
          for (const result of results) {
            console.log(`  ${chalk.cyan(result.chunk.id)} (${(result.score * 100).toFixed(0)}% match)`);
            console.log(`    ${result.chunk.text.substring(0, 150)}...`);
            console.log();
          }
        } else if (useGraph) {
          // Graph/Vector mode - search imported PRD chunks in Qdrant
          spinner.text = 'Searching imported requirements...';

          const { getEmbeddingCredentials } = await import('../utils/credentials.js');
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

          // Build filter for priority if specified
          const filter = options.priority ? {
            must: [{ key: 'priority', match: { value: options.priority } }]
          } : undefined;

          // Search in prd_chunks collection (created by cv import)
          const results = await vector.search(
            'prd_chunks',
            query,
            parseInt(options.limit),
            filter
          );

          spinner.stop();

          if (results.length === 0) {
            console.log(chalk.yellow('No matching requirements found'));
            console.log(chalk.gray('Tip: Run `cv import <path>` to import PRD data'));
            return;
          }

          console.log(chalk.bold(`\nFound ${results.length} requirements:\n`));
          for (const result of results) {
            const payload = result.payload as Record<string, unknown>;
            const priorityColor = payload.priority === 'critical' ? chalk.red :
              payload.priority === 'high' ? chalk.yellow : chalk.gray;

            console.log(`  ${chalk.cyan(result.id || 'unknown')} (${(result.score * 100).toFixed(0)}% match)`);
            console.log(`    [${priorityColor(payload.priority as string || 'medium')}] ${payload.chunk_type || 'requirement'}`);
            const text = payload.text as string || '';
            console.log(`    ${text.substring(0, 150)}...`);
            if (payload.prd_id) {
              console.log(chalk.gray(`    PRD: ${payload.prd_id}`));
            }
            console.log();
          }

          await vector.close();
        } else {
          // Local file mode - use vector search on cv_prd_chunks
          // Initialize vector manager
          const vectorUrl = config.vector?.url || 'http://localhost:6333';
          const apiKey = config.embedding?.apiKey;
          const vector = createVectorManager(vectorUrl, apiKey);

          await vector.connect();

          // Search in PRD collection
          const results = await vector.search(
            'cv_prd_chunks',
            query,
            parseInt(options.limit)
          );

          spinner.stop();

          if (results.length === 0) {
            console.log(chalk.yellow('No matching requirements found'));
            console.log(chalk.gray('Tip: Run `cv prd sync` to index requirements'));
            return;
          }

          console.log(chalk.bold(`\nFound ${results.length} requirements:\n`));
          for (const result of results) {
            const payload = result.payload as Record<string, unknown>;
            console.log(`  ${chalk.cyan(payload.chunk_id as string || 'unknown')} (${(result.score * 100).toFixed(0)}% match)`);
            const text = payload.text as string || '';
            console.log(`    ${text.substring(0, 150)}...`);
            if (payload.prd_id) {
              console.log(chalk.gray(`    PRD: ${payload.prd_id}`));
            }
            console.log();
          }

          await vector.close();
        }
      } catch (error) {
        spinner.fail(`Search failed: ${error}`);
      }
    });

  // ═══════════════════════════════════════════════════════════════
  // cv prd sync
  // ═══════════════════════════════════════════════════════════════
  prd
    .command('sync')
    .description('Sync PRDs to graph database and vector store')
    .option('--prd <id>', 'Sync specific PRD only')
    .option('--graph-only', 'Only sync to graph, skip vectors')
    .option('--vectors-only', 'Only sync vectors, skip graph')
    .action(async (options) => {
      const spinner = ora('Syncing PRDs...').start();

      try {
        const repoRoot = await findGitRoot();
        if (!repoRoot) {
          spinner.fail('Not in a git repository');
          return;
        }

        const prdDir = path.join(repoRoot, '.cvprd');
        const config = await configManager.load(repoRoot);

        if (!(await fileExists(path.join(prdDir, 'manifest.json')))) {
          spinner.fail('PRD not initialized. Run: cv prd init');
          return;
        }

        const manifest = await loadManifest(prdDir);

        if (manifest.prds.length === 0) {
          spinner.info('No PRDs to sync');
          return;
        }

        // Filter PRDs if specific one requested
        const prdsToSync = options.prd
          ? manifest.prds.filter(p => p.id === options.prd)
          : manifest.prds;

        if (prdsToSync.length === 0) {
          spinner.fail(`PRD not found: ${options.prd}`);
          return;
        }

        // Parse all PRDs
        const allChunks: PRDChunk[] = [];
        const allParsed: ParsedPRD[] = [];

        for (const entry of prdsToSync) {
          const content = await fs.readFile(
            path.join(repoRoot, '.cvprd', entry.file),
            'utf-8'
          );
          const parsed = parsePRDMarkdown(content, entry.id);
          allParsed.push(parsed);
          allChunks.push(...parsed.chunks);
        }

        spinner.text = `Syncing ${allChunks.length} chunks from ${prdsToSync.length} PRDs...`;

        // Sync to graph
        if (!options.vectorsOnly) {
          spinner.text = 'Syncing to FalkorDB...';

          const graphUrl = config.graph?.url || 'redis://localhost:6379';
          const graph = createGraphManager(graphUrl, 'cv-shared');

          await graph.connect();

          // Create PRD nodes
          for (const parsed of allParsed) {
            await graph.query(`
              MERGE (p:PRD {id: $id})
              SET p.name = $name, p.status = $status, p.updated = $updated
            `, {
              id: parsed.id,
              name: parsed.name,
              status: parsed.status,
              updated: new Date().toISOString()
            });

            // Create chunk nodes
            for (const chunk of parsed.chunks) {
              await graph.query(`
                MERGE (c:Chunk {id: $id})
                SET c.prd_id = $prd_id, c.text = $text, c.type = $type, c.priority = $priority
              `, {
                id: chunk.id,
                prd_id: parsed.id,
                text: chunk.text.substring(0, 1000), // Truncate for graph
                type: chunk.type,
                priority: chunk.priority || 'normal'
              });

              // Create BELONGS_TO relationship
              await graph.query(`
                MATCH (c:Chunk {id: $chunk_id})
                MATCH (p:PRD {id: $prd_id})
                MERGE (c)-[:BELONGS_TO]->(p)
              `, { chunk_id: chunk.id, prd_id: parsed.id });

              // Create dependency edges
              if (chunk.depends) {
                for (const dep of chunk.depends) {
                  await graph.query(`
                    MATCH (c:Chunk {id: $id})
                    MATCH (d:Chunk {id: $dep_id})
                    MERGE (c)-[:DEPENDS_ON]->(d)
                  `, { id: chunk.id, dep_id: dep });
                }
              }
            }
          }

          await graph.close();
          spinner.text = 'Graph sync complete';
        }

        // Sync to vectors
        if (!options.graphOnly) {
          spinner.text = 'Generating embeddings...';

          const vectorUrl = config.vector?.url || 'http://localhost:6333';
          const apiKey = config.embedding?.apiKey;
          const vector = createVectorManager(vectorUrl, apiKey);

          await vector.connect();

          // Ensure collection exists
          await vector.ensureCollection('cv_prd_chunks', manifest.embedding_model.dimensions);

          // Embed and upsert chunks
          const texts = allChunks.map(c => c.text);
          const embeddings = await vector.embedBatch(texts);

          const points = allChunks.map((chunk, i) => ({
            id: chunk.id,
            vector: embeddings[i],
            payload: {
              chunk_id: chunk.id,
              prd_id: chunk.prd_id,
              text: chunk.text,
              type: chunk.type,
              priority: chunk.priority || 'normal'
            }
          }));

          await vector.upsertBatch('cv_prd_chunks', points);

          // Update metadata file
          const metadata = allChunks.map(chunk => ({
            id: `vec-${chunk.id}`,
            chunk_id: chunk.id,
            text_hash: hashString(chunk.text),
            created: new Date().toISOString()
          }));

          await fs.writeFile(
            path.join(prdDir, 'vectors', 'metadata.jsonl'),
            metadata.map(m => JSON.stringify(m)).join('\n')
          );

          await vector.close();
        }

        // Update manifest
        manifest.updated = new Date().toISOString();
        manifest.stats.total_embeddings = allChunks.length;
        await saveManifest(prdDir, manifest);

        spinner.succeed(`Synced ${allChunks.length} chunks from ${prdsToSync.length} PRDs`);
      } catch (error) {
        spinner.fail(`Sync failed: ${error}`);
      }
    });

  // ═══════════════════════════════════════════════════════════════
  // cv prd link
  // ═══════════════════════════════════════════════════════════════
  prd
    .command('link <chunk-id> <location>')
    .description('Link code location to a requirement chunk')
    .option('--symbol <name>', 'Link by symbol name instead of file:line')
    .option('--auto', 'Auto-detect symbols in the file at the given line')
    .action(async (chunkId, location, options) => {
      const spinner = ora('Creating link...').start();

      try {
        const repoRoot = await findGitRoot();
        if (!repoRoot) {
          spinner.fail('Not in a git repository');
          return;
        }

        const prdDir = path.join(repoRoot, '.cvprd');
        const hasLocalPrds = await fileExists(path.join(prdDir, 'manifest.json'));

        // Parse location (file:line format)
        let file: string;
        let line: number | undefined;

        if (location.includes(':')) {
          const [f, l] = location.split(':');
          file = f;
          line = parseInt(l);
        } else {
          file = location;
        }

        // Verify file exists
        const fullPath = path.join(repoRoot, file);
        if (!(await fileExists(fullPath))) {
          spinner.fail(`File not found: ${file}`);
          return;
        }

        // Get symbol from graph if --auto is specified
        let symbolName = options.symbol;
        const config = await configManager.load(repoRoot);
        const graphUrl = config.graph?.url || 'redis://localhost:6379';
        const graph = createGraphManager(graphUrl, config.graph.database);

        await graph.connect();

        // First verify the chunk exists
        const chunkResult = await graph.query(`
          MATCH (c:Chunk {id: $id}) RETURN c.id as id, c.text as text
        `, { id: chunkId });

        if (chunkResult.length === 0) {
          // Try without the chunk: prefix
          const altResult = await graph.query(`
            MATCH (c:Chunk) WHERE c.id CONTAINS $id RETURN c.id as id, c.text as text
          `, { id: chunkId });

          if (altResult.length === 0) {
            await graph.close();
            spinner.fail(`Chunk not found: ${chunkId}`);
            console.log(chalk.gray('Tip: Run `cv prd show --graph <prd-id>` to see available chunks'));
            return;
          }
        }

        // Auto-detect symbol at line if requested
        if (options.auto && line) {
          spinner.text = 'Finding symbol at location...';
          const symbolResult = await graph.query(`
            MATCH (f:File {path: $file})-[:DEFINES]->(s:Symbol)
            WHERE s.line_start <= $line AND s.line_end >= $line
            RETURN s.name as name, s.kind as kind
            ORDER BY (s.line_end - s.line_start) ASC
            LIMIT 1
          `, { file, line });

          if (symbolResult.length > 0) {
            symbolName = symbolResult[0].name;
            spinner.text = `Found symbol: ${symbolName}`;
          }
        }

        // Create the IMPLEMENTS relationship in graph
        if (symbolName) {
          // Link to specific symbol
          await graph.query(`
            MATCH (c:Chunk {id: $chunk_id})
            MATCH (s:Symbol {name: $symbol})
            MERGE (s)-[r:IMPLEMENTS]->(c)
            SET r.file = $file, r.line = $line, r.created = timestamp()
          `, {
            chunk_id: chunkId,
            symbol: symbolName,
            file,
            line: line || 0
          });
        } else {
          // Link to file
          await graph.query(`
            MATCH (c:Chunk {id: $chunk_id})
            MERGE (f:File {path: $file})
            MERGE (f)-[r:IMPLEMENTS]->(c)
            SET r.line = $line, r.created = timestamp()
          `, {
            chunk_id: chunkId,
            file,
            line: line || 0
          });
        }

        await graph.close();

        // Also store locally if .cvprd exists
        if (hasLocalPrds) {
          const implPath = path.join(prdDir, 'links', 'implementations.jsonl');
          const impl = {
            chunk_id: chunkId,
            file,
            line,
            symbol: symbolName,
            created: new Date().toISOString()
          };
          await fs.appendFile(implPath, JSON.stringify(impl) + '\n');
          await updateCoverage(prdDir);
        }

        const target = symbolName ? `${symbolName} (${file}:${line})` : location;
        spinner.succeed(`Linked ${chalk.cyan(chunkId)} → ${chalk.green(target)}`);
      } catch (error) {
        spinner.fail(`Failed to create link: ${error}`);
      }
    });

  // ═══════════════════════════════════════════════════════════════
  // cv prd coverage
  // ═══════════════════════════════════════════════════════════════
  prd
    .command('coverage')
    .description('Show requirement coverage')
    .option('--missing', 'Show only unimplemented requirements')
    .action(async (options) => {
      try {
        const repoRoot = await findGitRoot();
        if (!repoRoot) {
          console.log(chalk.red('Not in a git repository'));
          return;
        }

        const prdDir = path.join(repoRoot, '.cvprd');

        const manifest = await loadManifest(prdDir);
        const coverageFile = path.join(prdDir, 'links', 'coverage.json');
        const coverage = JSON.parse(await fs.readFile(coverageFile, 'utf-8'));

        console.log(chalk.bold('\nRequirement Coverage:\n'));

        let totalChunks = 0;
        let implementedChunks = 0;

        for (const entry of manifest.prds) {
          const content = await fs.readFile(
            path.join(repoRoot, '.cvprd', entry.file),
            'utf-8'
          );
          const parsed = parsePRDMarkdown(content, entry.id);

          totalChunks += parsed.chunks.length;
          const implemented = parsed.chunks.filter(c =>
            coverage.coverage[c.id]
          ).length;
          implementedChunks += implemented;

          const pct = parsed.chunks.length > 0 ? (implemented / parsed.chunks.length) * 100 : 0;
          const color = pct >= 70 ? chalk.green : pct >= 40 ? chalk.yellow : chalk.red;

          console.log(`  ${chalk.cyan(entry.id)} - ${entry.name}`);
          console.log(`    ${color(`${pct.toFixed(0)}%`)} (${implemented}/${parsed.chunks.length} chunks)`);

          if (options.missing) {
            const missing = parsed.chunks.filter(c => !coverage.coverage[c.id]);
            for (const chunk of missing) {
              console.log(chalk.gray(`      ○ ${chunk.id}: ${chunk.text.substring(0, 60)}...`));
            }
          }
          console.log();
        }

        const totalPct = totalChunks > 0 ? (implementedChunks / totalChunks) * 100 : 0;
        const totalColor = totalPct >= 70 ? chalk.green : totalPct >= 40 ? chalk.yellow : chalk.red;

        console.log(chalk.bold('Overall:'));
        console.log(`  ${totalColor(`${totalPct.toFixed(0)}%`)} (${implementedChunks}/${totalChunks} requirements implemented)`);
      } catch (error) {
        console.error(chalk.red(`Error: ${error}`));
      }
    });

  // ═══════════════════════════════════════════════════════════════
  // cv prd export
  // ═══════════════════════════════════════════════════════════════
  prd
    .command('export')
    .description('Export PRD(s) from cv-prd API as .cvx file')
    .option('--api <url>', 'cv-prd API URL (auto-discovered if not specified)')
    .option('--prd <id>', 'Export specific PRD by ID (can be repeated)', collectArgs, [])
    .option('--all', 'Export all PRDs')
    .option('-o, --output <file>', 'Output file path (default: <project>.cvx)')
    .option('--full', 'Include full content (default: structure only)')
    .action(async (options) => {
      const spinner = ora('Discovering cv-prd service...').start();

      try {
        // Auto-discover cv-prd or use explicit URL
        let apiUrl = options.api;
        if (!apiUrl) {
          apiUrl = await discoverCvPrd();
          if (!apiUrl) {
            spinner.fail('cv-prd service not found');
            console.log(chalk.gray('\nTry one of:'));
            console.log(chalk.gray('  1. Start cv-prd: cvprd start'));
            console.log(chalk.gray('  2. Specify URL: cv prd export --api http://host:port'));
            console.log(chalk.gray('  3. Configure: cv services add prd http://host:port'));
            return;
          }
          spinner.text = `Found cv-prd at ${apiUrl}`;
        } else {
          // Verify provided URL
          try {
            const healthRes = await fetch(`${apiUrl}/api/v1/health`);
            if (!healthRes.ok) {
              spinner.fail(`cv-prd API not available at ${apiUrl}`);
              return;
            }
          } catch (e) {
            spinner.fail(`Cannot connect to cv-prd API at ${apiUrl}`);
            return;
          }
        }

        // Get PRD IDs to export
        let prdIds: string[] = options.prd;

        if (options.all || prdIds.length === 0) {
          spinner.text = 'Fetching PRD list...';
          const listRes = await fetch(`${apiUrl}/api/v1/prds`);
          const listData = await listRes.json() as { prds: Array<{ id: string; name: string; chunk_count: number }> };

          if (listData.prds.length === 0) {
            spinner.fail('No PRDs found in cv-prd');
            return;
          }

          // Filter to PRDs with chunks
          const prdsWithChunks = listData.prds.filter(p => p.chunk_count > 0);

          if (prdsWithChunks.length === 0) {
            spinner.fail('No PRDs with chunks found. Create and process PRDs in cv-prd first.');
            return;
          }

          if (!options.all && prdIds.length === 0) {
            // Interactive selection or use first with chunks
            console.log(chalk.yellow('\nAvailable PRDs:'));
            for (const prd of prdsWithChunks) {
              console.log(`  ${chalk.cyan(prd.id)} - ${prd.name} (${prd.chunk_count} chunks)`);
            }
            console.log(chalk.gray('\nUse --prd <id> to select specific PRDs, or --all for all'));
            spinner.stop();
            return;
          }

          prdIds = prdsWithChunks.map(p => p.id);
        }

        // Determine output filename
        let outputFile = options.output;
        if (!outputFile) {
          // Get project name from first PRD
          const firstPrdRes = await fetch(`${apiUrl}/api/v1/prds/${prdIds[0]}`);
          const firstPrd = await firstPrdRes.json() as { name: string };
          const projectName = firstPrd.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
          outputFile = `${projectName}.cvx`;
        }

        // Ensure .cvx extension
        if (!outputFile.endsWith('.cvx')) {
          outputFile += '.cvx';
        }

        spinner.text = `Exporting ${prdIds.length} PRD(s)...`;

        // Call export API
        const exportRes = await fetch(`${apiUrl}/api/v1/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            format: 'cv',
            export_type: options.full ? 'full' : 'structure',
            prd_ids: prdIds,
            project_name: path.basename(outputFile, '.cvx')
          })
        });

        if (!exportRes.ok) {
          const error = await exportRes.text();
          spinner.fail(`Export failed: ${error}`);
          return;
        }

        // Save the response (it's a zip file from API, we save as .cvx)
        const buffer = await exportRes.arrayBuffer();
        await fs.writeFile(outputFile, Buffer.from(buffer));

        spinner.succeed(`Exported to ${chalk.cyan(outputFile)}`);

        console.log(chalk.gray(`\nImport into cv-git with: cv import ${outputFile}`));
      } catch (error) {
        spinner.fail(`Export failed: ${error}`);
      }
    });

  // ═══════════════════════════════════════════════════════════════
  // cv prd api - Direct API commands (replaces curl)
  // ═══════════════════════════════════════════════════════════════

  const apiCmd = prd
    .command('api')
    .description('Interact with cv-prd API (replaces curl commands)');

  // cv prd api health
  apiCmd
    .command('health')
    .description('Check cv-prd service health')
    .action(async () => {
      const spinner = ora('Checking cv-prd health...').start();

      try {
        const apiUrl = await discoverCvPrd();
        if (!apiUrl) {
          spinner.fail('cv-prd service not found');
          return;
        }

        const res = await fetch(`${apiUrl}/api/v1/health`);
        const data = await res.json() as { status: string; version?: string };

        spinner.succeed(`cv-prd is ${chalk.green(data.status)}`);
        console.log(`  URL: ${chalk.cyan(apiUrl)}`);
        if (data.version) {
          console.log(`  Version: ${chalk.gray(data.version)}`);
        }
      } catch (error) {
        spinner.fail(`Health check failed: ${error}`);
      }
    });

  // cv prd api list
  apiCmd
    .command('list')
    .description('List all PRDs from cv-prd')
    .option('--json', 'Output raw JSON')
    .action(async (options) => {
      const spinner = ora('Fetching PRDs...').start();

      try {
        const apiUrl = await discoverCvPrd();
        if (!apiUrl) {
          spinner.fail('cv-prd service not found');
          return;
        }

        const res = await fetch(`${apiUrl}/api/v1/prds`);
        const data = await res.json() as { prds: Array<{ id: string; name: string; status: string; chunk_count: number; created_at: string }> };

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        if (data.prds.length === 0) {
          console.log(chalk.yellow('No PRDs found'));
          return;
        }

        console.log(chalk.bold('\nPRDs in cv-prd:\n'));
        for (const prd of data.prds) {
          const statusIcon = prd.status === 'active' ? chalk.green('●') :
            prd.status === 'draft' ? chalk.yellow('●') : chalk.gray('●');
          console.log(`  ${statusIcon} ${chalk.cyan(prd.id)}`);
          console.log(`    ${chalk.bold(prd.name)}`);
          console.log(`    Chunks: ${prd.chunk_count}, Status: ${prd.status}`);
          console.log();
        }
        console.log(`Total: ${data.prds.length} PRDs`);
      } catch (error) {
        spinner.fail(`Failed to list PRDs: ${error}`);
      }
    });

  // cv prd api create
  apiCmd
    .command('create <name>')
    .description('Create a new PRD in cv-prd')
    .option('-d, --description <text>', 'PRD description')
    .option('--json', 'Output raw JSON')
    .action(async (name: string, options) => {
      const spinner = ora('Creating PRD...').start();

      try {
        const apiUrl = await discoverCvPrd();
        if (!apiUrl) {
          spinner.fail('cv-prd service not found');
          return;
        }

        const res = await fetch(`${apiUrl}/api/v1/prds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description: options.description || '',
            status: 'draft'
          })
        });

        if (!res.ok) {
          const error = await res.text();
          spinner.fail(`Failed to create PRD: ${error}`);
          return;
        }

        const data = await res.json() as { id: string; name: string };

        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        spinner.succeed(`Created PRD: ${chalk.cyan(data.name)}`);
        console.log(`  ID: ${chalk.green(data.id)}`);
        console.log(chalk.gray('\nNext: Add content in the cv-prd web UI'));
      } catch (error) {
        spinner.fail(`Failed to create PRD: ${error}`);
      }
    });

  // cv prd api get
  apiCmd
    .command('get <id>')
    .description('Get PRD details from cv-prd')
    .option('--json', 'Output raw JSON')
    .action(async (id: string, options) => {
      const spinner = ora('Fetching PRD...').start();

      try {
        const apiUrl = await discoverCvPrd();
        if (!apiUrl) {
          spinner.fail('cv-prd service not found');
          return;
        }

        const res = await fetch(`${apiUrl}/api/v1/prds/${id}`);

        if (!res.ok) {
          if (res.status === 404) {
            spinner.fail(`PRD not found: ${id}`);
          } else {
            spinner.fail(`Failed to get PRD: ${await res.text()}`);
          }
          return;
        }

        const data = await res.json() as {
          id: string;
          name: string;
          description: string;
          status: string;
          created_at: string;
          updated_at: string;
          chunks?: Array<{ id: string; content: string; priority: string }>;
        };

        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        spinner.stop();

        console.log(chalk.bold(`\n${data.name}\n`));
        console.log(`  ID: ${chalk.cyan(data.id)}`);
        console.log(`  Status: ${data.status}`);
        if (data.description) {
          console.log(`  Description: ${data.description}`);
        }
        console.log(`  Created: ${new Date(data.created_at).toLocaleDateString()}`);
        console.log(`  Updated: ${new Date(data.updated_at).toLocaleDateString()}`);

        if (data.chunks && data.chunks.length > 0) {
          console.log(chalk.bold(`\n  Chunks (${data.chunks.length}):\n`));
          for (const chunk of data.chunks) {
            const priorityColor =
              chunk.priority === 'critical' ? chalk.red :
                chunk.priority === 'high' ? chalk.yellow :
                  chunk.priority === 'medium' ? chalk.blue : chalk.gray;
            console.log(`    ${priorityColor('●')} [${chunk.priority}] ${chunk.content.substring(0, 60)}...`);
          }
        }
      } catch (error) {
        spinner.fail(`Failed to get PRD: ${error}`);
      }
    });

  // cv prd api chunks
  apiCmd
    .command('chunks <prd-id>')
    .description('List chunks/requirements from a PRD')
    .option('--json', 'Output raw JSON')
    .option('--priority <level>', 'Filter by priority (critical, high, medium, low)')
    .action(async (prdId: string, options) => {
      const spinner = ora('Fetching chunks...').start();

      try {
        const apiUrl = await discoverCvPrd();
        if (!apiUrl) {
          spinner.fail('cv-prd service not found');
          return;
        }

        const res = await fetch(`${apiUrl}/api/v1/prds/${prdId}/chunks`);

        if (!res.ok) {
          spinner.fail(`Failed to get chunks: ${await res.text()}`);
          return;
        }

        let chunks = await res.json() as Array<{
          id: string;
          text?: string;      // cv-prd API uses 'text'
          content?: string;   // Some APIs use 'content'
          priority: string;
          type?: string;      // cv-prd API uses 'type'
          chunk_type?: string;
          tags?: string[];
        }>;

        // Filter by priority if specified
        if (options.priority) {
          chunks = chunks.filter(c => c.priority === options.priority);
        }

        if (options.json) {
          console.log(JSON.stringify(chunks, null, 2));
          return;
        }

        spinner.stop();

        if (chunks.length === 0) {
          console.log(chalk.yellow('No chunks found'));
          return;
        }

        console.log(chalk.bold(`\nRequirement Chunks (${chunks.length}):\n`));

        for (const chunk of chunks) {
          const priorityColor =
            chunk.priority === 'critical' ? chalk.red :
              chunk.priority === 'high' ? chalk.yellow :
                chunk.priority === 'medium' ? chalk.blue : chalk.gray;

          console.log(`  ${priorityColor('●')} ${chalk.cyan(chunk.id)}`);
          console.log(`    [${chunk.priority || 'medium'}] ${chunk.type || chunk.chunk_type || 'requirement'}`);
          const content = chunk.text || chunk.content || '(no content)';
          // First line only for display
          const firstLine = content.split('\n')[0].replace(/^- /, '');
          console.log(`    ${firstLine.substring(0, 80)}${firstLine.length > 80 ? '...' : ''}`);
          if (chunk.tags && chunk.tags.length > 0) {
            console.log(`    Tags: ${chunk.tags.join(', ')}`);
          }
          console.log();
        }
      } catch (error) {
        spinner.fail(`Failed to get chunks: ${error}`);
      }
    });

  // cv prd api process
  apiCmd
    .command('process <prd-id>')
    .description('Process PRD to extract requirements (AI analysis)')
    .action(async (prdId: string) => {
      const spinner = ora('Processing PRD...').start();
      spinner.text = 'This may take a moment...';

      try {
        const apiUrl = await discoverCvPrd();
        if (!apiUrl) {
          spinner.fail('cv-prd service not found');
          return;
        }

        const res = await fetch(`${apiUrl}/api/v1/prds/${prdId}/process`, {
          method: 'POST'
        });

        if (!res.ok) {
          spinner.fail(`Failed to process PRD: ${await res.text()}`);
          return;
        }

        const data = await res.json() as { chunks_created: number; message?: string };

        spinner.succeed(`Processed PRD: ${data.chunks_created} requirements extracted`);
      } catch (error) {
        spinner.fail(`Failed to process PRD: ${error}`);
      }
    });

  // cv prd api delete
  apiCmd
    .command('delete <id>')
    .description('Delete a PRD from cv-prd')
    .option('-f, --force', 'Skip confirmation')
    .action(async (id: string, options) => {
      if (!options.force) {
        console.log(chalk.yellow(`\nThis will delete PRD ${id} and all its chunks.`));
        console.log(chalk.gray('Use --force to skip this confirmation.\n'));
        return;
      }

      const spinner = ora('Deleting PRD...').start();

      try {
        const apiUrl = await discoverCvPrd();
        if (!apiUrl) {
          spinner.fail('cv-prd service not found');
          return;
        }

        const res = await fetch(`${apiUrl}/api/v1/prds/${id}`, {
          method: 'DELETE'
        });

        if (!res.ok) {
          if (res.status === 404) {
            spinner.fail(`PRD not found: ${id}`);
          } else {
            spinner.fail(`Failed to delete PRD: ${await res.text()}`);
          }
          return;
        }

        spinner.succeed(`Deleted PRD: ${chalk.cyan(id)}`);
      } catch (error) {
        spinner.fail(`Failed to delete PRD: ${error}`);
      }
    });

  return prd;
}

// Helper to collect multiple --prd arguments
function collectArgs(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadManifest(prdDir: string): Promise<PRDManifest> {
  const content = await fs.readFile(path.join(prdDir, 'manifest.json'), 'utf-8');
  return JSON.parse(content);
}

async function saveManifest(prdDir: string, manifest: PRDManifest): Promise<void> {
  await fs.writeFile(
    path.join(prdDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
}

/**
 * Parse PRD markdown with front-matter and chunk markers
 */
function parsePRDMarkdown(content: string, defaultId: string): ParsedPRD {
  const lines = content.split('\n');
  const chunks: PRDChunk[] = [];

  // Parse front-matter
  let frontMatter: Record<string, string | string[]> = {};
  let bodyStart = 0;

  if (lines[0] === '---') {
    const endIndex = lines.indexOf('---', 1);
    if (endIndex > 0) {
      const fmLines = lines.slice(1, endIndex);
      for (const line of fmLines) {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (match) {
          const [, key, value] = match;
          // Parse arrays
          if (value.startsWith('[') && value.endsWith(']')) {
            frontMatter[key] = value.slice(1, -1).split(',').map(s => s.trim());
          } else {
            frontMatter[key] = value;
          }
        }
      }
      bodyStart = endIndex + 1;
    }
  }

  // Parse chunks from body
  const body = lines.slice(bodyStart);
  let currentChunk: Partial<PRDChunk> | null = null;
  let chunkLines: string[] = [];

  for (let i = 0; i < body.length; i++) {
    const line = body[i];

    // Check for chunk start marker
    const startMatch = line.match(/<!--\s*chunk:(\S+)(?:\s+(.+))?\s*-->/);
    if (startMatch) {
      const [, chunkId, attrs] = startMatch;

      currentChunk = {
        id: chunkId,
        prd_id: (frontMatter.id as string) || defaultId,
        type: 'functional',
        line_start: bodyStart + i
      };

      // Parse attributes
      if (attrs) {
        const attrPairs = attrs.split(/\s+/);
        for (const pair of attrPairs) {
          const [key, value] = pair.split(':');
          if (key === 'priority') currentChunk.priority = value;
          if (key === 'type') currentChunk.type = value;
          if (key === 'depends') currentChunk.depends = value.split(',');
          if (key === 'implements') currentChunk.implements = value;
        }
      }

      chunkLines = [];
      continue;
    }

    // Check for chunk end marker
    if (line.match(/<!--\s*\/chunk\s*-->/)) {
      if (currentChunk) {
        currentChunk.text = chunkLines.join('\n').trim();
        currentChunk.line_end = bodyStart + i;
        chunks.push(currentChunk as PRDChunk);
        currentChunk = null;
      }
      continue;
    }

    // Accumulate chunk content
    if (currentChunk) {
      chunkLines.push(line);
    }
  }

  // Extract name from first heading if not in front-matter
  let name = frontMatter.name as string | undefined;
  if (!name) {
    const headingMatch = body.find(l => l.startsWith('# '));
    if (headingMatch) {
      name = headingMatch.replace(/^#\s+/, '');
    } else {
      name = defaultId;
    }
  }

  return {
    id: (frontMatter.id as string) || defaultId,
    name,
    version: frontMatter.version as string | undefined,
    status: (frontMatter.status as string) || 'draft',
    owner: frontMatter.owner as string | undefined,
    tags: (frontMatter.tags as string[]) || [],
    chunks,
    raw_content: content
  };
}

async function appendGraphNodes(prdDir: string, parsed: ParsedPRD): Promise<void> {
  const nodesPath = path.join(prdDir, 'graph', 'nodes.jsonl');
  const edgesPath = path.join(prdDir, 'graph', 'edges.jsonl');

  // Append PRD node
  const prdNode = {
    type: 'PRD',
    id: parsed.id,
    name: parsed.name,
    status: parsed.status,
    file: `prds/${parsed.id}.md`
  };
  await fs.appendFile(nodesPath, JSON.stringify(prdNode) + '\n');

  // Append chunk nodes and edges
  for (const chunk of parsed.chunks) {
    const chunkNode = {
      type: 'Chunk',
      id: chunk.id,
      prd_id: chunk.prd_id,
      text: chunk.text.substring(0, 500),
      priority: chunk.priority || 'normal',
      chunk_type: chunk.type
    };
    await fs.appendFile(nodesPath, JSON.stringify(chunkNode) + '\n');

    // BELONGS_TO edge
    const belongsEdge = {
      type: 'BELONGS_TO',
      from: chunk.id,
      to: parsed.id
    };
    await fs.appendFile(edgesPath, JSON.stringify(belongsEdge) + '\n');

    // DEPENDS_ON edges
    if (chunk.depends) {
      for (const dep of chunk.depends) {
        const depEdge = {
          type: 'DEPENDS_ON',
          from: chunk.id,
          to: dep
        };
        await fs.appendFile(edgesPath, JSON.stringify(depEdge) + '\n');
      }
    }
  }
}

async function updateCoverage(prdDir: string): Promise<void> {
  const implPath = path.join(prdDir, 'links', 'implementations.jsonl');
  const coveragePath = path.join(prdDir, 'links', 'coverage.json');

  const content = await fs.readFile(implPath, 'utf-8');
  const lines = content.trim().split('\n').filter(l => l);

  const coverage: Record<string, boolean> = {};
  for (const line of lines) {
    try {
      const impl = JSON.parse(line);
      coverage[impl.chunk_id] = true;
    } catch {
      // Skip invalid lines
    }
  }

  await fs.writeFile(coveragePath, JSON.stringify({
    coverage,
    updated: new Date().toISOString()
  }, null, 2));

  // Update manifest coverage stats
  const manifest = await loadManifest(prdDir);
  const implementedCount = Object.keys(coverage).length;
  manifest.stats.linked_symbols = implementedCount;
  manifest.stats.coverage_percent = manifest.stats.total_chunks > 0
    ? (implementedCount / manifest.stats.total_chunks) * 100
    : 0;

  // Update per-PRD coverage
  for (const entry of manifest.prds) {
    // Would need to load each PRD to calculate exact coverage
    // For now, use rough estimate
    entry.coverage = manifest.stats.coverage_percent / 100;
  }

  await saveManifest(prdDir, manifest);
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

export default createPRDCommand;
