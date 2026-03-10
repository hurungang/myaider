/**
 * In-process mock MCP HTTP server for tests.
 *
 * Starts a real Node.js HTTP server on a random port that speaks
 * the MCP Streamable HTTP protocol (JSON-RPC over POST).
 *
 * Usage:
 *   import { startMockServer, MOCK_TOOLS, MOCK_SKILLS, MOCK_SKILL_UPDATES } from './mock-server.js';
 *
 *   const server = await startMockServer();
 *   // server.url  — base URL, e.g. "http://127.0.0.1:PORT"
 *   // server.stop() — gracefully shuts the server down
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const MOCK_TOOLS = [
  {
    name: 'get_myaider_skills',
    description: 'Returns all available skills from the MyAider catalogue.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_myaider_skill_updates',
    description: 'Returns skills with their latest updated_at timestamps.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

export const MOCK_SKILLS = [
  {
    name: 'web-search',
    description: 'Search the web.',
    updated_at: '2026-01-01T00:00:00Z',
    instructions: '## Usage\nUse this skill to search the web for information.',
    tools: [
      {
        name: 'web_search',
        description: 'Perform a web search query.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Search query' } },
          required: ['query'],
        },
      },
    ],
  },
];

export const MOCK_SKILL_UPDATES = [
  { name: 'web-search', updated_at: '2026-01-01T00:00:00Z' },
];

// ---------------------------------------------------------------------------
// JSON-RPC dispatcher
// ---------------------------------------------------------------------------

function dispatch(req) {
  const { id, method, params } = req;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'mock-myaider-mcp', version: '0.0.1' },
        },
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: MOCK_TOOLS },
      };

    case 'tools/call': {
      const toolName = params?.name;
      if (toolName === 'get_myaider_skills') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(MOCK_SKILLS) }],
          },
        };
      }
      if (toolName === 'get_myaider_skill_updates') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(MOCK_SKILL_UPDATES) }],
          },
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Tool not found: ${toolName}` },
      };
    }

    case 'notifications/initialized':
      // Notification — no JSON-RPC response; caller should return 202
      return null;

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

/**
 * Starts the mock MCP server on a random available port.
 * @returns {Promise<{ url: string, stop: () => Promise<void> }>}
 */
export async function startMockServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Echo / assign session ID
      const sessionId = req.headers['mcp-session-id'] || randomUUID();
      res.setHeader('mcp-session-id', sessionId);

      // GET — SSE stream is not supported; the transport handles 405 gracefully
      if (req.method === 'GET') {
        res.writeHead(405);
        res.end();
        return;
      }

      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end();
        return;
      }

      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
          }));
          return;
        }

        const requests = Array.isArray(parsed) ? parsed : [parsed];
        const responses = requests.map(dispatch).filter(Boolean);

        if (responses.length === 0) {
          // All messages were notifications
          res.writeHead(202);
          res.end();
          return;
        }

        const out =
          responses.length === 1
            ? JSON.stringify(responses[0])
            : JSON.stringify(responses);

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(out),
        });
        res.end(out);
      });
    });

    server.on('error', reject);

    // Port 0 → OS picks a free port
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        stop: () =>
          new Promise((res, rej) =>
            server.close((err) => (err ? rej(err) : res()))
          ),
      });
    });
  });
}
