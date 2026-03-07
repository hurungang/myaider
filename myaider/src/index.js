/**
 * MyAider MCP Plugin for OpenClaw
 *
 * Registers an `myaider_mcp` agent tool that lets OpenClaw agents connect to
 * the MyAider MCP server and invoke its tools (list, call, get_skills,
 * get_skill_updates).
 *
 * Configuration (in openclaw.json):
 *   plugins.entries.myaider.config.url   — MyAider MCP server URL
 *   plugins.entries.myaider.config.enabled — enable/disable (default: true)
 *
 * @see https://www.myaider.ai/mcp
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from './http-transport.js';

// ---------------------------------------------------------------------------
// MyAider MCP Manager
// ---------------------------------------------------------------------------

class MyAiderMCPManager {
  constructor(logger) {
    this._logger = logger;
    this._client = null;
    this._transport = null;
    this._tools = [];
    this._initialized = false;
  }

  async connect(url) {
    if (this._initialized) return;

    // Validate and sanitise the URL before logging
    let safeUrl = url;
    try {
      const u = new URL(url);
      u.password = '';
      u.username = '';
      safeUrl = u.toString();
    } catch { /* keep original */ }

    this._logger.info(`[MyAider MCP] Connecting to ${safeUrl}`);

    this._transport = new StreamableHTTPClientTransport(url);
    this._client = new Client(
      { name: 'openclaw-myaider', version: '0.1.0' },
      { capabilities: {} }
    );

    await this._client.connect(this._transport);

    const { tools } = await this._client.listTools();
    this._tools = tools;
    this._initialized = true;

    this._logger.info(`[MyAider MCP] Connected — ${tools.length} tool(s) available`);
  }

  async callTool(name, args = {}) {
    if (!this._initialized) {
      throw new Error('MyAider MCP client not connected. Check your configuration.');
    }
    const result = await this._client.callTool({ name, arguments: args });
    return result;
  }

  listTools() {
    return this._tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  async disconnect() {
    if (!this._client) return;
    try {
      await this._client.close();
      this._logger.info('[MyAider MCP] Disconnected');
    } catch (err) {
      this._logger.error(`[MyAider MCP] Error during disconnect: ${err.message}`);
    } finally {
      this._client = null;
      this._transport = null;
      this._tools = [];
      this._initialized = false;
    }
  }
}

// ---------------------------------------------------------------------------
// OpenClaw plugin registration
// ---------------------------------------------------------------------------

export default function register(api) {
  const config = api.pluginConfig ?? {};
  const mcpUrl = config.url;

  if (!mcpUrl) {
    api.logger.warn(
      '[MyAider MCP] No MCP URL configured. ' +
      'Set plugins.entries.myaider.config.url in openclaw.json. ' +
      'Get your URL from https://www.myaider.ai/mcp'
    );
  }

  const manager = new MyAiderMCPManager(api.logger);

  // Lazy-connect on the first tool call to satisfy OpenClaw's synchronous
  // register() contract (no async work allowed at registration time).
  const ensureConnected = async () => {
    if (!mcpUrl) {
      throw new Error(
        'MyAider MCP URL not configured. ' +
        'Add plugins.entries.myaider.config.url to openclaw.json. ' +
        'Visit https://www.myaider.ai/mcp for setup instructions.'
      );
    }
    await manager.connect(mcpUrl);
  };

  // -------------------------------------------------------------------------
  // Register the myaider_mcp tool
  // -------------------------------------------------------------------------

  api.registerTool({
    name: 'myaider_mcp',
    label: 'MyAider MCP',
    description:
      'Connect to the MyAider MCP server and invoke its tools. ' +
      'Use action=list to discover available tools, then action=call to invoke one. ' +
      'Use action=get_skills to retrieve available MyAider skills, and ' +
      'action=get_skill_updates to check for updated skill versions.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'call', 'get_skills', 'get_skill_updates'],
          description:
            'list — list all available tools on the MyAider MCP server; ' +
            'call — invoke a specific tool by name; ' +
            'get_skills — shortcut to call get_myaider_skills (returns all available skills); ' +
            'get_skill_updates — shortcut to call get_myaider_skill_updates (returns skills with updated_at timestamps)',
        },
        tool: {
          type: 'string',
          description: 'Tool name to invoke (required for action=call)',
        },
        args: {
          type: 'object',
          description: 'Arguments to pass to the tool (for action=call)',
        },
      },
      required: ['action'],
    },

    async execute(_toolCallId, params) {
      try {
        await ensureConnected();

        switch (params.action) {
          case 'list': {
            const tools = manager.listTools();
            const text =
              tools.length > 0
                ? JSON.stringify(tools, null, 2)
                : 'No tools available. Verify the MyAider MCP URL in your configuration.';
            return { content: [{ type: 'text', text }], details: { tools } };
          }

          case 'get_skills': {
            const result = await manager.callTool('get_myaider_skills', {});
            const text = formatMcpResult(result);
            return { content: [{ type: 'text', text }], details: result };
          }

          case 'get_skill_updates': {
            const result = await manager.callTool('get_myaider_skill_updates', {});
            const text = formatMcpResult(result);
            return { content: [{ type: 'text', text }], details: result };
          }

          case 'call': {
            const toolName = params.tool;
            if (!toolName) {
              throw new Error('tool is required for action=call');
            }
            const result = await manager.callTool(toolName, params.args ?? {});
            const text = formatMcpResult(result);
            return { content: [{ type: 'text', text }], details: result };
          }

          default:
            throw new Error(`Unknown action: ${params.action}`);
        }
      } catch (err) {
        api.logger.error(`[MyAider MCP] Tool execute error: ${err.message}`);
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          details: null,
          isError: true,
        };
      }
    },
  });

  // Disconnect cleanly when the gateway stops
  api.registerHook(
    'gateway_stop',
    async () => {
      await manager.disconnect();
    },
    { name: 'myaider-mcp-shutdown', description: 'Disconnect from MyAider MCP on shutdown' }
  );

  api.logger.info('[MyAider MCP] Plugin registered');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts an MCP tool result to a plain text string for the agent.
 */
function formatMcpResult(result) {
  if (!result) return '(empty result)';
  if (Array.isArray(result.content)) {
    return result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n') || JSON.stringify(result, null, 2);
  }
  return JSON.stringify(result, null, 2);
}
