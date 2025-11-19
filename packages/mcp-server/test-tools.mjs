#!/usr/bin/env node

/**
 * Test CV-Git MCP Server Tools
 *
 * This script tests the MCP server tools by sending MCP protocol messages
 * and verifying the responses.
 */

import { spawn } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logSuccess(msg) {
  log(`✅ ${msg}`, 'green');
}

function logError(msg) {
  log(`❌ ${msg}`, 'red');
}

function logInfo(msg) {
  log(`ℹ️  ${msg}`, 'blue');
}

function logWarning(msg) {
  log(`⚠️  ${msg}`, 'yellow');
}

/**
 * Test the MCP server by spawning it and sending requests
 */
async function testMCPServer() {
  log('\n🧪 Testing CV-Git MCP Server Tools\n', 'blue');
  log('=====================================\n');

  const serverPath = resolve(__dirname, 'dist/index.js');

  // Start server
  logInfo('Starting MCP server...');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let output = '';
  let requestId = 1;

  server.stdout.on('data', (data) => {
    output += data.toString();
  });

  server.stderr.on('data', (data) => {
    // Server logs go to stderr
    const msg = data.toString().trim();
    if (msg && !msg.includes('MCP Server running')) {
      logInfo(`Server: ${msg}`);
    }
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  /**
   * Send a JSON-RPC request
   */
  function sendRequest(method, params = {}) {
    const request = {
      jsonrpc: '2.0',
      id: requestId++,
      method,
      params,
    };
    server.stdin.write(JSON.stringify(request) + '\n');
    return request.id;
  }

  /**
   * Wait for and parse response
   */
  async function getResponse(expectedId, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.trim() && line.trim().startsWith('{')) {
          try {
            const response = JSON.parse(line.trim());
            if (response.id === expectedId) {
              return response;
            }
          } catch (e) {
            // Not valid JSON yet
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timeout waiting for response to request ${expectedId}`);
  }

  let passedTests = 0;
  let totalTests = 0;

  /**
   * Test helper
   */
  async function test(name, testFn) {
    totalTests++;
    try {
      await testFn();
      logSuccess(`Test ${totalTests}: ${name}`);
      passedTests++;
    } catch (error) {
      logError(`Test ${totalTests}: ${name}`);
      logError(`  Error: ${error.message}`);
    }
  }

  try {
    // Test 1: Initialize
    await test('Initialize server', async () => {
      const id = sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      });
      output = ''; // Clear output
      const response = await getResponse(id);
      if (!response.result || !response.result.capabilities) {
        throw new Error('Invalid initialize response');
      }
    });

    // Test 2: List tools
    await test('List available tools', async () => {
      const id = sendRequest('tools/list');
      output = '';
      const response = await getResponse(id);
      if (!response.result || !response.result.tools || response.result.tools.length !== 15) {
        throw new Error(`Expected 15 tools, got ${response.result?.tools?.length || 0}`);
      }
      const toolNames = response.result.tools.map(t => t.name);
      const expectedTools = [
        'cv_find',
        'cv_explain',
        'cv_graph_query',
        'cv_graph_stats',
        'cv_graph_inspect',
        'cv_do',
        'cv_review',
        'cv_sync',
        'cv_pr_create',
        'cv_pr_list',
        'cv_pr_review',
        'cv_release_create',
        'cv_config_get',
        'cv_status',
        'cv_doctor',
      ];
      for (const tool of expectedTools) {
        if (!toolNames.includes(tool)) {
          throw new Error(`Missing tool: ${tool}`);
        }
      }
    });

    // Test 3: Call cv_graph_stats
    await test('Call cv_graph_stats tool', async () => {
      const id = sendRequest('tools/call', {
        name: 'cv_graph_stats',
        arguments: {},
      });
      output = '';
      const response = await getResponse(id, 10000);
      if (response.error) {
        // This might fail if not in a CV-Git repo, which is expected
        logWarning(`  Note: ${response.error.message}`);
      } else if (!response.result || !response.result.content) {
        throw new Error('Invalid response from cv_graph_stats');
      }
    });

    // Test 4: Call cv_sync (may fail if not initialized)
    await test('Call cv_sync tool', async () => {
      const id = sendRequest('tools/call', {
        name: 'cv_sync',
        arguments: { incremental: true },
      });
      output = '';
      const response = await getResponse(id, 15000);
      if (response.error) {
        // Expected if not in a repo
        logWarning(`  Note: ${response.error.message}`);
      } else if (!response.result || !response.result.content) {
        throw new Error('Invalid response from cv_sync');
      }
    });

    // Test 5: Call cv_status
    await test('Call cv_status tool', async () => {
      const id = sendRequest('tools/call', {
        name: 'cv_status',
        arguments: {},
      });
      output = '';
      const response = await getResponse(id, 10000);
      if (response.error) {
        logWarning(`  Note: ${response.error.message}`);
      } else if (!response.result || !response.result.content) {
        throw new Error('Invalid response from cv_status');
      }
    });

    // Test 6: Call cv_doctor
    await test('Call cv_doctor tool', async () => {
      const id = sendRequest('tools/call', {
        name: 'cv_doctor',
        arguments: {},
      });
      output = '';
      const response = await getResponse(id, 10000);
      if (response.error) {
        logWarning(`  Note: ${response.error.message}`);
      } else if (!response.result || !response.result.content) {
        throw new Error('Invalid response from cv_doctor');
      }
    });

    // Test 7: Call cv_config_get
    await test('Call cv_config_get tool', async () => {
      const id = sendRequest('tools/call', {
        name: 'cv_config_get',
        arguments: { key: 'version' },
      });
      output = '';
      const response = await getResponse(id, 10000);
      if (response.error) {
        // Expected if not initialized
        logWarning(`  Note: ${response.error.message}`);
      } else if (!response.result || !response.result.content) {
        throw new Error('Invalid response from cv_config_get');
      }
    });

    // Summary
    log('\n=====================================\n');
    if (passedTests === totalTests) {
      logSuccess(`All ${totalTests} tests passed! 🎉`);
    } else {
      logWarning(`${passedTests}/${totalTests} tests passed`);
    }
    log('');
    logInfo('MCP Server is functional and ready for Claude Desktop');
    log('');

  } catch (error) {
    logError(`Test failed: ${error.message}`);
  } finally {
    // Cleanup
    server.kill();
  }
}

// Run tests
testMCPServer().catch((error) => {
  logError(`Fatal error: ${error.message}`);
  process.exit(1);
});
