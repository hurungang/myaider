/**
 * MyAider MCP Plugin for OpenClaw
 *
 * Registers an `myaider_mcp` agent tool that lets OpenClaw agents connect to
 * the MyAider MCP server and invoke its tools (list, call).
 *
 * Configuration (in openclaw.json):
 *   plugins.entries.myaider.config.url   — MyAider MCP server URL
 *   plugins.entries.myaider.config.enabled — enable/disable (default: true)
 *
 * @see https://www.myaider.ai/mcp
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from './http-transport.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
    this._connectingPromise = null;
  }

  async connect(url) {
    if (this._initialized) return;

    // If a connection attempt is already in flight, wait for it rather than
    // starting a second one.
    if (this._connectingPromise) {
      return this._connectingPromise;
    }

    this._connectingPromise = (async () => {
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
    })();

    try {
      await this._connectingPromise;
    } finally {
      this._connectingPromise = null;
    }
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
      this._connectingPromise = null;
    }
  }
}

// ---------------------------------------------------------------------------
// OpenClaw plugin registration
// ---------------------------------------------------------------------------

export default function register(api) {
  const config = api.pluginConfig ?? {};
  const mcpUrl = config.url;

  // Directory where dynamically synced skills are written.
  // Override via pluginConfig.skillsDir (useful for testing).
  const skillsDir =
    config.skillsDir ??
    join(fileURLToPath(new URL('..', import.meta.url)), 'skills-dynamic');

  // Ensure skills-dynamic directory exists (OpenClaw loads skills from this path)
  try {
    if (!existsSync(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
      api.logger.info(`[MyAider MCP] Created skills directory: ${skillsDir}`);
    }
  } catch (err) {
    api.logger.warn(`[MyAider MCP] Could not create skills directory: ${err.message}`);
  }

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
      'Use action=list to discover available tools, then action=call to invoke one.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'call', 'get_skills', 'get_skill_updates', 'sync_skills'],
          description:
            'list — list all available tools on the MyAider MCP server; ' +
            'call — invoke a specific tool by name; ' +
            'get_skills — shortcut to call get_myaider_skills; ' +
            'get_skill_updates — shortcut to call get_myaider_skill_updates; ' +
            'sync_skills — fetch all MyAider skills and write them as SKILL.md files ' +
            'into the plugin skills-dynamic directory (no skill-creator needed)',
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

          case 'call': {
            const toolName = params.tool;
            if (!toolName) {
              throw new Error('tool is required for action=call');
            }
            const result = await manager.callTool(toolName, params.args ?? {});
            const text = formatMcpResult(result);
            return { content: [{ type: 'text', text }], details: result };
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

          case 'sync_skills': {
            const { written, failed } = await syncSkillsToDir(manager, skillsDir);

            const lines = [`Synced ${written.length} skill(s) to ${skillsDir}.`];
            if (written.length) lines.push(`Written: ${written.join(', ')}`);
            if (failed.length) lines.push(`Failed: ${failed.join(', ')}`);
            const text = lines.join('\n');
            return {
              content: [{ type: 'text', text }],
              details: { written, failed, skillsDir },
            };
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

  // Auto-sync skills when the plugin loads (fire-and-forget; errors are logged, not thrown)
  if (mcpUrl) {
    setImmediate(async () => {
      try {
        await manager.connect(mcpUrl);
        const { written, failed } = await syncSkillsToDir(manager, skillsDir);
        api.logger.info(`[MyAider MCP] Auto-synced ${written.length} skill(s) to ${skillsDir}.`);
        if (failed.length) {
          api.logger.warn(`[MyAider MCP] Auto-sync: ${failed.length} failure(s): ${failed.join(', ')}`);
        }
      } catch (err) {
        api.logger.warn(`[MyAider MCP] Auto-sync failed: ${err.message}`);
      }
    });
  }

  api.logger.info('[MyAider MCP] Plugin registered');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetches all skills from the MyAider MCP server and writes SKILL.md files
 * to the given directory.  Used by both the agent-triggered sync_skills action
 * and the automatic startup sync.
 *
 * @param {MyAiderMCPManager} manager - Connected MCP manager
 * @param {string} skillsDir - Absolute path to the target skills directory
 * @returns {Promise<{ written: string[], failed: string[], skillsDir: string }>}
 */
async function syncSkillsToDir(manager, skillsDir) {
  const result = await manager.callTool('get_myaider_skills', {});
  const rawText = formatMcpResult(result);

  let skills;
  try {
    skills = JSON.parse(rawText);
    if (!Array.isArray(skills)) throw new TypeError('Expected an array of skills');
  } catch (err) {
    throw new Error(`Failed to parse skills from MyAider: ${err.message}`);
  }

  const written = [];
  const failed = [];

  for (const skill of skills) {
    if (!skill.name) { failed.push('(unnamed skill)'); continue; }
    try {
      const dir = join(skillsDir, skill.name);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'SKILL.md'), buildSkillMd(skill), 'utf-8');
      written.push(skill.name);
    } catch (err) {
      failed.push(`${skill.name}: ${err.message}`);
    }
  }

  return { written, failed, skillsDir };
}

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

/**
 * Generates a SKILL.md file content for a skill returned by get_myaider_skills.
 *
 * The format follows the AgentSkills / OpenClaw convention:
 *   - YAML frontmatter with name, description, and single-line JSON metadata
 *   - Optional instructions body
 *   - Tool invocation reference
 *   - Optional inline tool schemas (reduces runtime MCP round-trips)
 *
 * @param {object} skill - Skill definition from get_myaider_skills
 * @returns {string} SKILL.md file content
 */
function buildSkillMd(skill) {
  const name = skill.name ?? 'unnamed';
  // Flatten to a single line and wrap in double quotes for safe YAML embedding.
  // Only backslash and double-quote need escaping inside YAML double-quoted scalars.
  const rawDesc = (skill.description ?? '').replace(/\n/g, ' ');
  const description = '"' + rawDesc.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const updatedAt = skill.updated_at ?? new Date().toISOString();

  // metadata must be a single-line JSON object (per OpenClaw AgentSkills spec)
  const metadata = JSON.stringify({
    openclaw: { emoji: '🤖', homepage: 'https://www.myaider.ai' },
    source: 'myaider',
    updated_at: updatedAt,
  });

  const lines = [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    `metadata: ${metadata}`,
    '---',
    '',
    '## Important Notes — Tool Calling',
    '',
    '> **IMPORTANT — Call Tool Step**: When the workflow instructs you to call a tool (e.g., `logfire__alert_status`, `some_mcp_tool`), you MUST use the `myaider_mcp` agent tool with this approach:',
    '>',
    '> ```json',
    '> { "action": "call", "tool": "<tool-name>", "args": { ... } }',
    '> ```',
    '>',
    '> MCP tool names from MyAider skills (like `logfire__alert_status`) are NOT native OpenClaw tools. You MUST route all tool calls through `myaider_mcp` with `action: "call"`.',
    '>',
    '> **Never** call MCP tool names directly as if they were native OpenClaw tools.',
    '',
  ];

  if (skill.instructions) {
    lines.push(String(skill.instructions).trim(), '');
  }

  // Tools section - appended as the last section
  if (Array.isArray(skill.tools) && skill.tools.length > 0) {
    lines.push('', '## Tools');
    for (const tool of skill.tools) {
      lines.push('', `### ${tool.name}`);
      if (tool.description) lines.push('', tool.description);
      if (tool.inputSchema) {
        lines.push('', '**Parameters:**', '```json', JSON.stringify(tool.inputSchema, null, 2), '```');
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}
