/**
 * Integration tests for MyAiderMCPManager (src/index.js)
 *
 * Each test suite spins up the in-process mock MCP server so the manager
 * executes a real MCP handshake over HTTP.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockServer, MOCK_TOOLS, MOCK_SKILLS, MOCK_SKILL_UPDATES } from './mock-server.js';

// ---------------------------------------------------------------------------
// Import the classes under test.
// MyAiderMCPManager is not exported from index.js, so we test it indirectly
// by re-implementing a minimal version and also via the register() default export.
// We import the internals by importing the default export and using a stub api.
// ---------------------------------------------------------------------------

// We test MyAiderMCPManager via register() using a stub OpenClaw API.
import register from '../src/index.js';

// ---------------------------------------------------------------------------
// Stub OpenClaw API
// ---------------------------------------------------------------------------

function makeStubApi(mcpUrl) {
  const tools = {};
  const hooks = {};
  const logs = { info: [], warn: [], error: [] };

  const api = {
    pluginConfig: { url: mcpUrl },
    logger: {
      info: (m) => logs.info.push(m),
      warn: (m) => logs.warn.push(m),
      error: (m) => logs.error.push(m),
    },
    registerTool(def) {
      tools[def.name] = def;
    },
    registerHook(event, fn, meta) {
      hooks[event] = { fn, meta };
    },
    _tools: tools,
    _hooks: hooks,
    _logs: logs,
  };
  return api;
}

// ---------------------------------------------------------------------------
// Helper: invoke the registered myaider_mcp tool
// ---------------------------------------------------------------------------

async function callMcpTool(api, params) {
  const tool = api._tools['myaider_mcp'];
  assert.ok(tool, 'myaider_mcp tool was not registered');
  return tool.execute('tool-call-id', params);
}

// ---------------------------------------------------------------------------
// Tests: plugin registration
// ---------------------------------------------------------------------------

describe('register() — plugin setup', () => {
  it('registers the myaider_mcp tool', () => {
    const api = makeStubApi('http://127.0.0.1:9/unused');
    register(api);
    assert.ok(api._tools['myaider_mcp'], 'tool registered');
  });

  it('registers a gateway_stop hook', () => {
    const api = makeStubApi('http://127.0.0.1:9/unused');
    register(api);
    assert.ok(api._hooks['gateway_stop'], 'hook registered');
  });

  it('logs a warning when no URL is configured', () => {
    const api = makeStubApi(undefined);
    api.pluginConfig = {};
    register(api);
    assert.ok(
      api._logs.warn.some((m) => m.includes('No MCP URL configured')),
      'warning logged'
    );
  });

  it('does not warn when a URL is configured', () => {
    const api = makeStubApi('http://127.0.0.1:9/mcp');
    register(api);
    assert.equal(api._logs.warn.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Tests: action=list (lazy connect + listTools)
// ---------------------------------------------------------------------------

describe('myaider_mcp action=list', () => {
  let server;
  let api;

  before(async () => {
    server = await startMockServer();
    api = makeStubApi(server.url);
    register(api);
  });

  after(async () => {
    await api._hooks['gateway_stop']?.fn();
    await server.stop();
  });

  it('returns a JSON list of tools', async () => {
    const result = await callMcpTool(api, { action: 'list' });
    assert.equal(result.isError, undefined, `Unexpected error: ${result.content?.[0]?.text}`);
    assert.ok(Array.isArray(result.details.tools));
    assert.equal(result.details.tools.length, MOCK_TOOLS.length);
    assert.equal(result.details.tools[0].name, MOCK_TOOLS[0].name);
  });

  it('returns non-empty text content', async () => {
    const result = await callMcpTool(api, { action: 'list' });
    assert.ok(result.content[0].text.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Tests: action=get_skills
// ---------------------------------------------------------------------------

describe('myaider_mcp action=get_skills', () => {
  let server;
  let api;

  before(async () => {
    server = await startMockServer();
    api = makeStubApi(server.url);
    register(api);
  });

  after(async () => {
    await api._hooks['gateway_stop']?.fn();
    await server.stop();
  });

  it('returns skills from the mock server', async () => {
    const result = await callMcpTool(api, { action: 'get_skills' });
    assert.equal(result.isError, undefined, `Unexpected error: ${result.content?.[0]?.text}`);
    const skills = JSON.parse(result.content[0].text);
    assert.equal(skills.length, MOCK_SKILLS.length);
    assert.equal(skills[0].name, MOCK_SKILLS[0].name);
  });
});

// ---------------------------------------------------------------------------
// Tests: action=get_skill_updates
// ---------------------------------------------------------------------------

describe('myaider_mcp action=get_skill_updates', () => {
  let server;
  let api;

  before(async () => {
    server = await startMockServer();
    api = makeStubApi(server.url);
    register(api);
  });

  after(async () => {
    await api._hooks['gateway_stop']?.fn();
    await server.stop();
  });

  it('returns skill update info from the mock server', async () => {
    const result = await callMcpTool(api, { action: 'get_skill_updates' });
    assert.equal(result.isError, undefined, `Unexpected error: ${result.content?.[0]?.text}`);
    const updates = JSON.parse(result.content[0].text);
    assert.equal(updates.length, MOCK_SKILL_UPDATES.length);
    assert.equal(updates[0].name, MOCK_SKILL_UPDATES[0].name);
    assert.ok(updates[0].updated_at);
  });
});

// ---------------------------------------------------------------------------
// Tests: action=call
// ---------------------------------------------------------------------------

describe('myaider_mcp action=call', () => {
  let server;
  let api;

  before(async () => {
    server = await startMockServer();
    api = makeStubApi(server.url);
    register(api);
  });

  after(async () => {
    await api._hooks['gateway_stop']?.fn();
    await server.stop();
  });

  it('calls a tool by name and returns its result', async () => {
    const result = await callMcpTool(api, {
      action: 'call',
      tool: 'get_myaider_skills',
      args: {},
    });
    assert.equal(result.isError, undefined, `Unexpected error: ${result.content?.[0]?.text}`);
    assert.ok(result.content[0].text.length > 0);
  });

  it('returns isError=true when tool name is missing', async () => {
    const result = await callMcpTool(api, { action: 'call' });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('tool is required'));
  });
});

// ---------------------------------------------------------------------------
// Tests: missing URL
// ---------------------------------------------------------------------------

describe('myaider_mcp — missing URL', () => {
  it('returns isError=true with setup instructions when URL is not configured', async () => {
    const api = makeStubApi(undefined);
    api.pluginConfig = {};
    register(api);
    const result = await callMcpTool(api, { action: 'list' });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('URL not configured'));
  });
});

// ---------------------------------------------------------------------------
// Tests: lazy connect idempotency
// ---------------------------------------------------------------------------

describe('myaider_mcp — connection idempotency', () => {
  let server;
  let api;

  before(async () => {
    server = await startMockServer();
    api = makeStubApi(server.url);
    register(api);
  });

  after(async () => {
    await api._hooks['gateway_stop']?.fn();
    await server.stop();
  });

  it('connects only once across multiple tool calls', async () => {
    // Two consecutive calls should both succeed (no "already initialized" error)
    const [r1, r2] = await Promise.all([
      callMcpTool(api, { action: 'list' }),
      callMcpTool(api, { action: 'get_skills' }),
    ]);
    assert.equal(r1.isError, undefined);
    assert.equal(r2.isError, undefined);
  });
});

// ---------------------------------------------------------------------------
// Tests: gateway_stop hook
// ---------------------------------------------------------------------------

describe('gateway_stop hook', () => {
  it('calls disconnect cleanly without throwing', async () => {
    const server = await startMockServer();
    const api = makeStubApi(server.url);
    register(api);

    // Trigger a connect first
    await callMcpTool(api, { action: 'list' });

    // Then disconnect via the hook
    await assert.doesNotReject(() => api._hooks['gateway_stop'].fn());
    await server.stop();
  });

  it('calling gateway_stop when never connected does not throw', async () => {
    const api = makeStubApi('http://127.0.0.1:9/unused');
    register(api);
    await assert.doesNotReject(() => api._hooks['gateway_stop'].fn());
  });
});
