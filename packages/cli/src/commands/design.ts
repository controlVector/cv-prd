/**
 * cv design command
 * Design-first scaffolding with knowledge graph
 *
 * ============================================================================
 * PRD INTEGRATION DESIGN DOCUMENT
 * ============================================================================
 *
 * ## Overview
 *
 * The `--from-prd` flag will fetch requirements from cvPRD and use them to
 * generate architecture designs. This enables a requirements-to-code workflow.
 *
 * ## Usage
 *
 * ```bash
 * # Single requirement
 * cv design --from-prd REQ-abc123
 *
 * # Multiple requirements
 * cv design --from-prd "REQ-abc123,REQ-def456"
 *
 * # Search by tag
 * cv design --from-prd "tag:authentication"
 *
 * # With description context
 * cv design --from-prd REQ-abc123 "Focus on the API layer"
 * ```
 *
 * ## Implementation Plan
 *
 * ### 1. New Interfaces (add to this file)
 *
 * ```typescript
 * interface PRDDesignSource {
 *   type: 'chunk' | 'search' | 'prd';
 *   ids?: string[];           // Chunk IDs
 *   query?: string;           // Search query
 *   tag?: string;             // Tag filter
 * }
 *
 * interface PRDDesignContext {
 *   requirements: AIContext[];      // From prd-client
 *   primaryText: string;            // Combined requirement text
 *   constraints: string[];          // Extracted constraints
 *   acceptanceCriteria: string[];   // Extracted from metadata
 *   dependencies: string[];         // Related requirements
 * }
 * ```
 *
 * ### 2. New Functions to Implement
 *
 * ```typescript
 * // Parse --from-prd flag value
 * function parsePRDReference(ref: string): PRDDesignSource
 *
 * // Fetch requirements from cvPRD
 * async function fetchPRDContext(
 *   client: PRDClient,
 *   source: PRDDesignSource
 * ): Promise<PRDDesignContext>
 *
 * // Build design prompt from PRD context
 * function buildPRDDesignPrompt(
 *   context: PRDDesignContext,
 *   additionalDescription?: string
 * ): string
 *
 * // Link generated design back to PRD
 * async function linkDesignToPRD(
 *   client: PRDClient,
 *   context: PRDDesignContext,
 *   schema: DesignSchema,
 *   files: string[]
 * ): Promise<void>
 * ```
 *
 * ### 3. Enhanced System Prompt
 *
 * When --from-prd is used, augment DESIGN_SYSTEM_PROMPT with:
 * - Requirement text and context
 * - Acceptance criteria as constraints
 * - Dependencies as architectural considerations
 * - Priority levels for feature ordering
 *
 * ### 4. Configuration
 *
 * Add to cv-git.config.json:
 * ```json
 * {
 *   "prd": {
 *     "url": "http://localhost:8000",
 *     "apiKey": "${CVPRD_API_KEY}"
 *   }
 * }
 * ```
 *
 * ### 5. PRD Client Integration
 *
 * Key methods from @cv-git/prd-client to use:
 * - getChunk(chunkId) - Get single requirement
 * - getContext(chunkId, { strategy: 'expanded' }) - Get with dependencies
 * - search({ query, filters }) - Search requirements
 * - linkImplementation(chunkId, { files, symbols }) - Link generated code
 * - PRDClient.formatContextForPrompt(context) - Format for AI
 *
 * ### 6. Flow
 *
 * 1. Parse --from-prd value → PRDDesignSource
 * 2. Create PRDClient from config
 * 3. Fetch requirements with context → PRDDesignContext
 * 4. Build enriched prompt with requirements
 * 5. Generate design (existing flow)
 * 6. Display design with requirement mapping
 * 7. On scaffold: link files to requirements in cvPRD
 * 8. Update requirement status to 'in_progress' or 'implemented'
 *
 * ### 7. Output Enhancements
 *
 * Show requirement traceability:
 * ```
 * ## Design: User Authentication System
 *
 * Based on Requirements:
 *   • REQ-abc123: Users shall authenticate via OAuth2 [critical]
 *   • REQ-def456: System shall support SSO [high]
 *
 * ### Modules
 *   auth/ - Authentication module
 *     ↳ Implements: REQ-abc123, REQ-def456
 * ```
 *
 * ### 8. Error Handling
 *
 * - cvPRD unavailable: Warn and fall back to description-only mode
 * - Chunk not found: List available chunks, suggest search
 * - No requirements match: Suggest broader search
 *
 * ============================================================================
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  configManager,
  createOpenRouterClient,
  createGraphManager,
  GraphManager,
} from '@cv-git/core';
import { findRepoRoot } from '@cv-git/shared';
import { CredentialManager } from '@cv-git/credentials';
import { addGlobalOptions, createOutput } from '../utils/output.js';

// PRD Integration
import { PRDClient, AIContext, Chunk } from '@cv-git/prd-client';

/**
 * Source specification for PRD-based design
 */
export interface PRDDesignSource {
  type: 'chunk' | 'search' | 'tag' | 'prd';
  ids?: string[];           // Chunk IDs (REQ-xxx, CHUNK-xxx)
  query?: string;           // Search query
  tag?: string;             // Tag filter
  prdId?: string;           // Full PRD ID
}

/**
 * Aggregated context from PRD for design generation
 */
export interface PRDDesignContext {
  source: PRDDesignSource;
  requirements: Array<{
    id: string;
    text: string;
    type: string;
    priority?: string;
    status?: string;
  }>;
  constraints: string[];
  acceptanceCriteria: string[];
  dependencies: string[];
  relatedChunks: string[];
  totalTokens: number;
}

/**
 * Parse --from-prd flag value into structured source
 *
 * Formats:
 * - "REQ-abc123" → single chunk
 * - "REQ-abc,REQ-def" → multiple chunks
 * - "tag:authentication" → tag search
 * - "search:user login" → semantic search
 * - "prd:uuid" → entire PRD
 */
export function parsePRDReference(ref: string): PRDDesignSource {
  const trimmed = ref.trim();

  // Tag search: "tag:authentication"
  if (trimmed.startsWith('tag:')) {
    return { type: 'tag', tag: trimmed.slice(4).trim() };
  }

  // Semantic search: "search:user login flow"
  if (trimmed.startsWith('search:')) {
    return { type: 'search', query: trimmed.slice(7).trim() };
  }

  // Full PRD: "prd:uuid"
  if (trimmed.startsWith('prd:')) {
    return { type: 'prd', prdId: trimmed.slice(4).trim() };
  }

  // Chunk IDs: "REQ-abc123" or "REQ-abc,REQ-def,CHUNK-xyz"
  const ids = trimmed.split(',').map(id => id.trim()).filter(Boolean);
  return { type: 'chunk', ids };
}

/**
 * Build design prompt enriched with PRD context
 */
export function buildPRDEnrichedPrompt(
  context: PRDDesignContext,
  additionalDescription?: string
): string {
  const parts: string[] = [];

  parts.push('Design a software system based on the following requirements:\n');

  // Primary requirements
  parts.push('## Requirements\n');
  for (const req of context.requirements) {
    const priority = req.priority ? ` [${req.priority}]` : '';
    parts.push(`- **${req.id}**${priority}: ${req.text}`);
  }
  parts.push('');

  // Constraints
  if (context.constraints.length > 0) {
    parts.push('## Constraints\n');
    for (const constraint of context.constraints) {
      parts.push(`- ${constraint}`);
    }
    parts.push('');
  }

  // Acceptance criteria
  if (context.acceptanceCriteria.length > 0) {
    parts.push('## Acceptance Criteria\n');
    for (const ac of context.acceptanceCriteria) {
      parts.push(`- ${ac}`);
    }
    parts.push('');
  }

  // Dependencies (other requirements this depends on)
  if (context.dependencies.length > 0) {
    parts.push('## Dependencies\n');
    parts.push('This design must account for:\n');
    for (const dep of context.dependencies) {
      parts.push(`- ${dep}`);
    }
    parts.push('');
  }

  // Additional user context
  if (additionalDescription) {
    parts.push('## Additional Context\n');
    parts.push(additionalDescription);
    parts.push('');
  }

  return parts.join('\n');
}

interface DesignOptions {
  fromPrd?: string;
  interactive?: boolean;
  output?: 'graph' | 'diagram' | 'scaffold' | 'all';
  model?: string;
  dryRun?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

interface DesignModule {
  name: string;
  path: string;
  description: string;
}

interface DesignType {
  name: string;
  kind: 'interface' | 'type' | 'enum' | 'class';
  module: string;
  properties?: { name: string; type: string; description?: string }[];
  description: string;
}

interface DesignFunction {
  name: string;
  module: string;
  parameters: { name: string; type: string }[];
  returnType: string;
  description: string;
  async?: boolean;
}

interface DesignRelationship {
  from: string;
  to: string;
  type: 'calls' | 'imports' | 'implements' | 'extends' | 'uses';
}

interface DesignSchema {
  name: string;
  description: string;
  modules: DesignModule[];
  types: DesignType[];
  functions: DesignFunction[];
  relationships: DesignRelationship[];
}

const DESIGN_SYSTEM_PROMPT = `You are an expert software architect. Your task is to design a software system based on the user's requirements.

Output a JSON schema with the following structure:
{
  "name": "Project/feature name",
  "description": "Brief description",
  "modules": [
    { "name": "moduleName", "path": "src/module", "description": "What this module does" }
  ],
  "types": [
    {
      "name": "TypeName",
      "kind": "interface|type|enum|class",
      "module": "moduleName",
      "properties": [{ "name": "propName", "type": "string", "description": "optional" }],
      "description": "What this type represents"
    }
  ],
  "functions": [
    {
      "name": "functionName",
      "module": "moduleName",
      "parameters": [{ "name": "param", "type": "string" }],
      "returnType": "ReturnType",
      "description": "What this function does",
      "async": true
    }
  ],
  "relationships": [
    { "from": "functionA", "to": "functionB", "type": "calls" }
  ]
}

Guidelines:
1. Create clear module boundaries with single responsibilities
2. Define interfaces before implementations
3. Use TypeScript-style types
4. Keep functions focused and composable
5. Minimize circular dependencies
6. Include error handling types where appropriate
7. Consider testability in the design

Return ONLY valid JSON, no markdown or explanation.`;

export function designCommand(): Command {
  const cmd = new Command('design');

  cmd
    .description('Design-first scaffolding with knowledge graph')
    .argument('[description]', 'Natural language description of what to build')
    .option('--from-prd <ref>', 'Pull design from PRD reference')
    .option('-i, --interactive', 'Interactive design refinement')
    .option('-o, --output <type>', 'Output type: graph, diagram, scaffold, all', 'all')
    .option('-m, --model <model>', 'AI model to use', 'claude-sonnet-4-5-20250514')
    .option('--dry-run', 'Show what would be created without writing files');

  addGlobalOptions(cmd);

  cmd.action(async (description: string | undefined, options: DesignOptions) => {
    const output = createOutput(options as any);

    try {
      const repoRoot = await findRepoRoot();
      if (!repoRoot) {
        console.error(chalk.red('Not in a CV-Git repository. Run `cv init` first.'));
        process.exit(1);
      }

      // Get description
      let designPrompt = description;
      let prdClient: PRDClient | undefined;
      let prdContext: PRDDesignContext | undefined;

      if (options.fromPrd) {
        // Load PRD config
        const config = await configManager.load(repoRoot);

        if (!config.cvprd?.url) {
          console.error(chalk.red('cvPRD not configured.'));
          console.error(chalk.gray('Add cvprd.url to cv-git.config.json or set CVPRD_URL environment variable'));
          process.exit(1);
        }

        // Create PRDClient
        prdClient = new PRDClient({
          baseUrl: config.cvprd.url,
          apiKey: config.cvprd.apiKey || process.env.CVPRD_API_KEY
        });

        // Check availability
        const prdSpinner = ora('Connecting to cvPRD...').start();
        const available = await prdClient.isAvailable();

        if (!available) {
          prdSpinner.warn('cvPRD not available. Falling back to description mode.');
          prdClient = undefined;

          if (!description) {
            console.error(chalk.red('cvPRD unavailable and no description provided.'));
            console.error(chalk.gray('Provide a description or ensure cvPRD is running.'));
            process.exit(1);
          }
        } else {
          prdSpinner.succeed('Connected to cvPRD');

          // Parse reference and fetch context
          const fetchSpinner = ora('Fetching requirements...').start();
          try {
            const source = parsePRDReference(options.fromPrd);
            prdContext = await fetchPRDContext(prdClient, source);

            if (prdContext.requirements.length === 0) {
              fetchSpinner.warn('No requirements found matching the reference');
              console.error(chalk.yellow(`Reference: ${options.fromPrd}`));
              console.error(chalk.gray('Try: cv design --from-prd "search:your query"'));
              process.exit(1);
            }

            fetchSpinner.succeed(`Found ${prdContext.requirements.length} requirements`);

            // Build enriched prompt
            designPrompt = buildPRDEnrichedPrompt(prdContext, description);
          } catch (error: any) {
            fetchSpinner.fail(`Failed to fetch requirements: ${error.message}`);

            if (!description) {
              process.exit(1);
            }
            console.log(chalk.yellow('Falling back to description mode.'));
            prdContext = undefined;
          }
        }
      }

      if (!designPrompt) {
        if (options.interactive) {
          designPrompt = await askForDescription();
        } else {
          console.error(chalk.red('Please provide a description or use --interactive'));
          cmd.help();
          process.exit(1);
        }
      }

      // Get API key
      let openrouterApiKey = process.env.OPENROUTER_API_KEY;

      try {
        const credentials = new CredentialManager();
        await credentials.init();
        if (!openrouterApiKey) {
          openrouterApiKey = await credentials.getOpenRouterKey() || undefined;
        }
      } catch {
        // Credential manager not available
      }

      if (!openrouterApiKey) {
        console.error(chalk.red('OpenRouter API key not found.'));
        console.error(chalk.gray('Run: cv auth setup openrouter'));
        process.exit(1);
      }

      // Generate design
      const spinner = ora('Generating design...').start();

      const client = createOpenRouterClient({
        apiKey: openrouterApiKey,
        model: options.model,
        temperature: 0.3, // Lower temperature for more structured output
      });

      let designSchema: DesignSchema;

      try {
        const response = await client.chat(
          [{ role: 'user', content: `Design a system for: ${designPrompt}` }],
          DESIGN_SYSTEM_PROMPT
        );

        // Parse JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('Failed to parse design schema from AI response');
        }

        designSchema = JSON.parse(jsonMatch[0]);
        spinner.succeed('Design generated');

      } catch (error: any) {
        spinner.fail('Design generation failed');
        console.error(chalk.red(error.message));
        process.exit(1);
      }

      // Validate design
      const validation = validateDesign(designSchema);
      if (validation.errors.length > 0) {
        console.log(chalk.yellow('\n⚠ Validation warnings:'));
        validation.errors.forEach(e => console.log(chalk.yellow(`  • ${e}`)));
      }

      // Display design (with PRD context if available)
      if (prdContext) {
        displayDesignWithPRDContext(designSchema, prdContext);
      } else {
        displayDesign(designSchema);
      }

      // Interactive refinement
      if (options.interactive) {
        designSchema = await interactiveRefinement(designSchema, client);
      }

      // Output based on options
      const outputType = options.output || 'all';

      if (outputType === 'diagram' || outputType === 'all') {
        console.log(chalk.bold('\n## Mermaid Diagram\n'));
        console.log('```mermaid');
        console.log(generateMermaidDiagram(designSchema));
        console.log('```\n');
      }

      if (outputType === 'scaffold' || outputType === 'all') {
        if (options.dryRun) {
          console.log(chalk.bold('\n## Scaffold Preview (dry run)\n'));
          const files = generateScaffoldFiles(designSchema);
          for (const [filePath, content] of Object.entries(files)) {
            console.log(chalk.cyan(`\n// ${filePath}`));
            console.log(chalk.gray(content.slice(0, 500) + (content.length > 500 ? '\n...' : '')));
          }
        } else {
          const confirmed = await askConfirmation('\nGenerate scaffold files?');
          if (confirmed) {
            await writeScaffoldFiles(repoRoot, designSchema);
            console.log(chalk.green('\n✓ Scaffold files created'));

            // Link scaffold files to PRD requirements
            if (prdClient && prdContext) {
              const linkSpinner = ora('Linking to cvPRD requirements...').start();
              try {
                const generatedFiles = Object.keys(generateScaffoldFiles(designSchema));
                await linkDesignToPRD(prdClient, prdContext, designSchema, generatedFiles);
                linkSpinner.succeed('Linked to requirements');
              } catch (error: any) {
                linkSpinner.warn(`Could not link to cvPRD: ${error.message}`);
              }
            }
          }
        }
      }

      if (outputType === 'graph' || outputType === 'all') {
        const config = await configManager.load(repoRoot);
        const confirmed = options.dryRun ? false : await askConfirmation('\nAdd to knowledge graph?');

        if (confirmed) {
          const graphSpinner = ora('Adding to knowledge graph...').start();
          try {
            const graph = createGraphManager(config.graph.url, config.graph.database);
            await graph.connect();
            await addDesignToGraph(graph, designSchema);
            await graph.close();
            graphSpinner.succeed('Added to knowledge graph');
          } catch (error: any) {
            graphSpinner.warn(`Could not add to graph: ${error.message}`);
          }
        }
      }

      console.log(chalk.green('\n✓ Design complete'));

    } catch (error: any) {
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
 * Ask for design description interactively
 */
async function askForDescription(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log(chalk.cyan('\nDescribe what you want to build:'));
    console.log(chalk.gray('(Be specific about features, components, and requirements)\n'));

    rl.question(chalk.green('> '), (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Ask for confirmation
 */
async function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(chalk.cyan(`${question} (y/N): `), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Validate design schema
 */
function validateDesign(schema: DesignSchema): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for empty design
  if (!schema.modules?.length && !schema.types?.length && !schema.functions?.length) {
    errors.push('Design is empty');
  }

  // Check for undefined modules in types/functions
  const moduleNames = new Set(schema.modules?.map(m => m.name) || []);

  for (const type of schema.types || []) {
    if (type.module && !moduleNames.has(type.module)) {
      errors.push(`Type "${type.name}" references undefined module "${type.module}"`);
    }
  }

  for (const fn of schema.functions || []) {
    if (fn.module && !moduleNames.has(fn.module)) {
      errors.push(`Function "${fn.name}" references undefined module "${fn.module}"`);
    }
  }

  // Check for circular dependencies (basic check)
  const callGraph = new Map<string, Set<string>>();
  for (const rel of schema.relationships || []) {
    if (rel.type === 'calls') {
      if (!callGraph.has(rel.from)) {
        callGraph.set(rel.from, new Set());
      }
      callGraph.get(rel.from)!.add(rel.to);
    }
  }

  // Simple cycle detection
  for (const [from, tos] of callGraph) {
    for (const to of tos) {
      if (callGraph.get(to)?.has(from)) {
        errors.push(`Potential circular dependency: ${from} <-> ${to}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Display design schema
 */
function displayDesign(schema: DesignSchema): void {
  console.log(chalk.bold.cyan(`\n## ${schema.name}\n`));
  console.log(chalk.gray(schema.description));

  if (schema.modules?.length) {
    console.log(chalk.bold('\n### Modules\n'));
    for (const mod of schema.modules) {
      console.log(chalk.white(`  ${mod.name}/`) + chalk.gray(` - ${mod.description}`));
      console.log(chalk.gray(`    ${mod.path}`));
    }
  }

  if (schema.types?.length) {
    console.log(chalk.bold('\n### Types\n'));
    for (const type of schema.types) {
      console.log(chalk.yellow(`  ${type.kind} ${type.name}`) + chalk.gray(` - ${type.description}`));
      if (type.properties?.length) {
        for (const prop of type.properties.slice(0, 3)) {
          console.log(chalk.gray(`    ${prop.name}: ${prop.type}`));
        }
        if (type.properties.length > 3) {
          console.log(chalk.gray(`    ... +${type.properties.length - 3} more`));
        }
      }
    }
  }

  if (schema.functions?.length) {
    console.log(chalk.bold('\n### Functions\n'));
    for (const fn of schema.functions) {
      const params = fn.parameters?.map(p => `${p.name}: ${p.type}`).join(', ') || '';
      const asyncPrefix = fn.async ? 'async ' : '';
      console.log(chalk.green(`  ${asyncPrefix}${fn.name}(${params})`) + chalk.gray(` → ${fn.returnType}`));
      console.log(chalk.gray(`    ${fn.description}`));
    }
  }

  if (schema.relationships?.length) {
    console.log(chalk.bold('\n### Relationships\n'));
    for (const rel of schema.relationships.slice(0, 10)) {
      console.log(chalk.gray(`  ${rel.from} --[${rel.type}]--> ${rel.to}`));
    }
    if (schema.relationships.length > 10) {
      console.log(chalk.gray(`  ... +${schema.relationships.length - 10} more`));
    }
  }

  // Summary
  console.log(chalk.bold('\n### Summary\n'));
  console.log(chalk.gray(`  ${schema.modules?.length || 0} modules, ${schema.types?.length || 0} types, ${schema.functions?.length || 0} functions`));
}

/**
 * Interactive refinement loop
 */
async function interactiveRefinement(
  schema: DesignSchema,
  client: ReturnType<typeof createOpenRouterClient>
): Promise<DesignSchema> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.gray('\nRefine your design (type "done" to finish, "help" for commands):\n'));

  return new Promise((resolve) => {
    const ask = () => {
      rl.question(chalk.green('refine> '), async (input) => {
        const trimmed = input.trim().toLowerCase();

        if (trimmed === 'done' || trimmed === 'exit') {
          rl.close();
          resolve(schema);
          return;
        }

        if (trimmed === 'help') {
          console.log(chalk.gray(`
Commands:
  add <description>    Add a component
  remove <name>        Remove a component
  show                 Show current design
  done                 Finish refinement
`));
          ask();
          return;
        }

        if (trimmed === 'show') {
          displayDesign(schema);
          ask();
          return;
        }

        // Send refinement to AI
        const spinner = ora('Refining...').start();
        try {
          const response = await client.chat(
            [{
              role: 'user',
              content: `Current design:\n${JSON.stringify(schema, null, 2)}\n\nUser request: ${input}\n\nReturn the updated design as JSON.`
            }],
            DESIGN_SYSTEM_PROMPT
          );

          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            schema = JSON.parse(jsonMatch[0]);
            spinner.succeed('Updated');
            displayDesign(schema);
          } else {
            spinner.warn('Could not parse response');
          }
        } catch (error: any) {
          spinner.fail(error.message);
        }

        ask();
      });
    };

    ask();
  });
}

/**
 * Generate Mermaid diagram
 */
function generateMermaidDiagram(schema: DesignSchema): string {
  const lines: string[] = ['classDiagram'];

  // Add types as classes
  for (const type of schema.types || []) {
    lines.push(`  class ${type.name} {`);
    if (type.properties) {
      for (const prop of type.properties) {
        lines.push(`    +${prop.type} ${prop.name}`);
      }
    }
    lines.push('  }');
  }

  // Add functions grouped by module
  const moduleGroups = new Map<string, DesignFunction[]>();
  for (const fn of schema.functions || []) {
    const mod = fn.module || 'root';
    if (!moduleGroups.has(mod)) {
      moduleGroups.set(mod, []);
    }
    moduleGroups.get(mod)!.push(fn);
  }

  for (const [mod, fns] of moduleGroups) {
    lines.push(`  class ${mod} {`);
    for (const fn of fns) {
      const params = fn.parameters?.map(p => p.type).join(', ') || '';
      lines.push(`    +${fn.name}(${params}) ${fn.returnType}`);
    }
    lines.push('  }');
  }

  // Add relationships
  for (const rel of schema.relationships || []) {
    const arrow = rel.type === 'implements' ? '..|>' :
                  rel.type === 'extends' ? '--|>' :
                  rel.type === 'calls' ? '-->' :
                  '-->';
    lines.push(`  ${rel.from} ${arrow} ${rel.to}`);
  }

  return lines.join('\n');
}

/**
 * Generate scaffold files
 */
function generateScaffoldFiles(schema: DesignSchema): Record<string, string> {
  const files: Record<string, string> = {};

  // Generate module directories with index files
  for (const mod of schema.modules || []) {
    const indexPath = `${mod.path}/index.ts`;
    const types = (schema.types || []).filter(t => t.module === mod.name);
    const functions = (schema.functions || []).filter(f => f.module === mod.name);

    let content = `/**\n * ${mod.name}\n * ${mod.description}\n */\n\n`;

    // Export types
    if (types.length) {
      content += `// Types\n`;
      for (const type of types) {
        content += `export { ${type.name} } from './types.js';\n`;
      }
      content += '\n';
    }

    // Export functions
    if (functions.length) {
      content += `// Functions\n`;
      for (const fn of functions) {
        content += `export { ${fn.name} } from './${fn.name}.js';\n`;
      }
    }

    files[indexPath] = content;
  }

  // Generate type files
  const typesByModule = new Map<string, DesignType[]>();
  for (const type of schema.types || []) {
    const mod = type.module || 'types';
    if (!typesByModule.has(mod)) {
      typesByModule.set(mod, []);
    }
    typesByModule.get(mod)!.push(type);
  }

  for (const [mod, types] of typesByModule) {
    const modPath = (schema.modules || []).find(m => m.name === mod)?.path || `src/${mod}`;
    let content = `/**\n * ${mod} types\n */\n\n`;

    for (const type of types) {
      content += `/**\n * ${type.description}\n */\n`;

      if (type.kind === 'interface') {
        content += `export interface ${type.name} {\n`;
        for (const prop of type.properties || []) {
          if (prop.description) {
            content += `  /** ${prop.description} */\n`;
          }
          content += `  ${prop.name}: ${prop.type};\n`;
        }
        content += '}\n\n';
      } else if (type.kind === 'type') {
        content += `export type ${type.name} = {\n`;
        for (const prop of type.properties || []) {
          content += `  ${prop.name}: ${prop.type};\n`;
        }
        content += '};\n\n';
      } else if (type.kind === 'enum') {
        content += `export enum ${type.name} {\n`;
        for (const prop of type.properties || []) {
          content += `  ${prop.name} = '${prop.name}',\n`;
        }
        content += '}\n\n';
      }
    }

    files[`${modPath}/types.ts`] = content;
  }

  // Generate function files
  for (const fn of schema.functions || []) {
    const mod = (schema.modules || []).find(m => m.name === fn.module);
    const modPath = mod?.path || `src/${fn.module || 'functions'}`;

    const params = fn.parameters?.map(p => `${p.name}: ${p.type}`).join(', ') || '';
    const asyncKeyword = fn.async ? 'async ' : '';
    const returnType = fn.async ? `Promise<${fn.returnType}>` : fn.returnType;

    let content = `/**\n * ${fn.name}\n * ${fn.description}\n */\n\n`;
    content += `export ${asyncKeyword}function ${fn.name}(${params}): ${returnType} {\n`;
    content += `  // TODO: Implement ${fn.name}\n`;
    content += `  throw new Error('Not implemented');\n`;
    content += '}\n';

    files[`${modPath}/${fn.name}.ts`] = content;
  }

  return files;
}

/**
 * Write scaffold files to disk
 */
async function writeScaffoldFiles(repoRoot: string, schema: DesignSchema): Promise<void> {
  const files = generateScaffoldFiles(schema);

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(repoRoot, filePath);
    const dir = path.dirname(fullPath);

    // Create directory
    await fs.mkdir(dir, { recursive: true });

    // Check if file exists
    try {
      await fs.access(fullPath);
      console.log(chalk.yellow(`  Skipped (exists): ${filePath}`));
      continue;
    } catch {
      // File doesn't exist, create it
    }

    await fs.writeFile(fullPath, content);
    console.log(chalk.green(`  Created: ${filePath}`));
  }
}

/**
 * Add design to knowledge graph
 */
async function addDesignToGraph(graph: GraphManager, schema: DesignSchema): Promise<void> {
  // Add modules as file nodes (planned)
  for (const mod of schema.modules || []) {
    await graph.query(`
      MERGE (f:File {path: '${mod.path}/index.ts'})
      SET f.status = 'planned',
          f.description = '${mod.description.replace(/'/g, "\\'")}'
    `);
  }

  // Add types as symbol nodes (planned)
  for (const type of schema.types || []) {
    const mod = (schema.modules || []).find(m => m.name === type.module);
    const filePath = mod ? `${mod.path}/types.ts` : `src/${type.module || 'types'}/types.ts`;

    await graph.query(`
      MERGE (s:Symbol {name: '${type.name}'})
      SET s.kind = '${type.kind}',
          s.file = '${filePath}',
          s.status = 'planned',
          s.description = '${type.description.replace(/'/g, "\\'")}'
    `);
  }

  // Add functions as symbol nodes (planned)
  for (const fn of schema.functions || []) {
    const mod = (schema.modules || []).find(m => m.name === fn.module);
    const filePath = mod ? `${mod.path}/${fn.name}.ts` : `src/${fn.module || 'functions'}/${fn.name}.ts`;

    await graph.query(`
      MERGE (s:Symbol {name: '${fn.name}'})
      SET s.kind = 'function',
          s.file = '${filePath}',
          s.status = 'planned',
          s.description = '${fn.description.replace(/'/g, "\\'")}',
          s.async = ${fn.async || false}
    `);
  }

  // Add relationships
  for (const rel of schema.relationships || []) {
    const relType = rel.type.toUpperCase();
    await graph.query(`
      MATCH (a:Symbol {name: '${rel.from}'})
      MATCH (b:Symbol {name: '${rel.to}'})
      MERGE (a)-[:${relType}]->(b)
    `);
  }
}

// ============================================================================
// PRD INTEGRATION FUNCTIONS
// ============================================================================

/**
 * Fetch requirements context from cvPRD
 */
export async function fetchPRDContext(
  client: PRDClient,
  source: PRDDesignSource
): Promise<PRDDesignContext> {
  const context: PRDDesignContext = {
    source,
    requirements: [],
    constraints: [],
    acceptanceCriteria: [],
    dependencies: [],
    relatedChunks: [],
    totalTokens: 0
  };

  switch (source.type) {
    case 'chunk':
      // Fetch each chunk with expanded context
      for (const id of source.ids || []) {
        const aiContext = await client.getContext(id, {
          strategy: 'expanded',
          depth: 2
        });
        // Extract requirement info
        context.requirements.push({
          id: aiContext.primary_chunk.chunk_id,
          text: aiContext.primary_chunk.text,
          type: aiContext.primary_chunk.chunk_type,
          priority: aiContext.primary_chunk.metadata.priority,
          status: aiContext.primary_chunk.metadata.status
        });
        // Extract constraints
        for (const c of aiContext.constraints) {
          context.constraints.push(c.text);
        }
        // Extract dependencies
        for (const d of aiContext.dependencies) {
          context.dependencies.push(d.text);
        }
        // Extract related chunks
        for (const r of aiContext.related) {
          context.relatedChunks.push(r.chunk_id);
        }
        context.totalTokens += aiContext.total_tokens;
      }
      break;

    case 'search':
      const results = await client.search({
        query: source.query!,
        filters: { chunk_type: ['requirement', 'feature'] },
        limit: 10
      });
      for (const result of results) {
        context.requirements.push({
          id: result.chunk.id,
          text: result.chunk.text,
          type: result.chunk.chunk_type,
          priority: result.chunk.metadata.priority,
          status: result.chunk.metadata.status
        });
      }
      break;

    case 'tag':
      const tagged = await client.findByTag(source.tag!, 20);
      for (const chunk of tagged) {
        context.requirements.push({
          id: chunk.id,
          text: chunk.text,
          type: chunk.chunk_type,
          priority: chunk.metadata.priority,
          status: chunk.metadata.status
        });
      }
      break;

    case 'prd':
      const chunks = await client.getChunksForPRD(source.prdId!);
      for (const chunk of chunks) {
        if (chunk.chunk_type === 'requirement' || chunk.chunk_type === 'feature') {
          context.requirements.push({
            id: chunk.id,
            text: chunk.text,
            type: chunk.chunk_type,
            priority: chunk.metadata.priority,
            status: chunk.metadata.status
          });
        } else if (chunk.chunk_type === 'constraint') {
          context.constraints.push(chunk.text);
        }
      }
      break;
  }

  return context;
}

/**
 * Link generated design artifacts back to cvPRD requirements
 */
export async function linkDesignToPRD(
  client: PRDClient,
  context: PRDDesignContext,
  schema: DesignSchema,
  generatedFiles: string[]
): Promise<void> {
  // Extract symbol names from design
  const symbols = [
    ...(schema.types?.map(t => t.name) || []),
    ...(schema.functions?.map(f => f.name) || [])
  ];

  // Link each requirement to the generated code
  // Note: We don't have commit SHA yet since files are just scaffolded
  // The linkImplementation will mark the requirement as 'implemented'
  for (const req of context.requirements) {
    await client.linkImplementation(req.id, {
      commit_sha: 'scaffold', // Placeholder until actual commit
      symbols,
      files: generatedFiles
    });
  }
}

/**
 * Display design with PRD requirement traceability
 */
function displayDesignWithPRDContext(
  schema: DesignSchema,
  context: PRDDesignContext
): void {
  console.log(chalk.bold.cyan(`\n## ${schema.name}\n`));
  console.log(chalk.gray(schema.description));

  // Show source requirements
  console.log(chalk.bold('\n### Based on Requirements\n'));
  for (const req of context.requirements) {
    const priority = req.priority ? chalk.yellow(` [${req.priority}]`) : '';
    console.log(`  ${chalk.green('•')} ${chalk.white(req.id)}${priority}`);
    console.log(chalk.gray(`    ${req.text.slice(0, 80)}${req.text.length > 80 ? '...' : ''}`));
  }

  // Show constraints
  if (context.constraints.length > 0) {
    console.log(chalk.bold('\n### Constraints\n'));
    for (const c of context.constraints) {
      console.log(chalk.yellow(`  ⚠ ${c}`));
    }
  }

  // Show dependencies
  if (context.dependencies.length > 0) {
    console.log(chalk.bold('\n### Dependencies\n'));
    for (const dep of context.dependencies) {
      console.log(chalk.gray(`  → ${dep.slice(0, 80)}${dep.length > 80 ? '...' : ''}`));
    }
  }

  // Show modules with requirement mapping
  if (schema.modules?.length) {
    console.log(chalk.bold('\n### Modules\n'));
    for (const mod of schema.modules) {
      console.log(chalk.white(`  ${mod.name}/`) + chalk.gray(` - ${mod.description}`));
      console.log(chalk.gray(`    ${mod.path}`));
      // Show which requirements this module implements
      if (context.requirements.length > 0) {
        const reqIds = context.requirements.map(r => r.id).join(', ');
        console.log(chalk.cyan(`    ↳ Implements: ${reqIds}`));
      }
    }
  }

  if (schema.types?.length) {
    console.log(chalk.bold('\n### Types\n'));
    for (const type of schema.types) {
      console.log(chalk.yellow(`  ${type.kind} ${type.name}`) + chalk.gray(` - ${type.description}`));
      if (type.properties?.length) {
        for (const prop of type.properties.slice(0, 3)) {
          console.log(chalk.gray(`    ${prop.name}: ${prop.type}`));
        }
        if (type.properties.length > 3) {
          console.log(chalk.gray(`    ... +${type.properties.length - 3} more`));
        }
      }
    }
  }

  if (schema.functions?.length) {
    console.log(chalk.bold('\n### Functions\n'));
    for (const fn of schema.functions) {
      const params = fn.parameters?.map(p => `${p.name}: ${p.type}`).join(', ') || '';
      const asyncPrefix = fn.async ? 'async ' : '';
      console.log(chalk.green(`  ${asyncPrefix}${fn.name}(${params})`) + chalk.gray(` → ${fn.returnType}`));
      console.log(chalk.gray(`    ${fn.description}`));
    }
  }

  if (schema.relationships?.length) {
    console.log(chalk.bold('\n### Relationships\n'));
    for (const rel of schema.relationships.slice(0, 10)) {
      console.log(chalk.gray(`  ${rel.from} --[${rel.type}]--> ${rel.to}`));
    }
    if (schema.relationships.length > 10) {
      console.log(chalk.gray(`  ... +${schema.relationships.length - 10} more`));
    }
  }

  // Summary with coverage info
  console.log(chalk.bold('\n### Summary\n'));
  console.log(chalk.gray(`  ${schema.modules?.length || 0} modules, ${schema.types?.length || 0} types, ${schema.functions?.length || 0} functions`));
  console.log(chalk.gray(`  Covers ${context.requirements.length} requirements, ${context.constraints.length} constraints`));
}
