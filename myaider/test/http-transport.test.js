/**
 * Tests for StreamableHTTPClientTransport (src/http-transport.js)
 *
 * Each suite starts a lightweight HTTP server whose handler is injected per
 * test, so we can simulate exact server behaviours without coupling to the
 * full MCP mock.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { StreamableHTTPClientTransport } from '../src/http-transport.js';

// ---------------------------------------------------------------------------
// Test-server helper
// ---------------------------------------------------------------------------

/** Start a one-shot HTTP server. `handler` receives (req, res). */
function makeServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        stop: () => new Promise((res, rej) => server.close((e) => (e ? rej(e) : res()))),
      });
    });
  });
}

/** Collect the full POST body from a request. */
function readBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => { buf += c; });
    req.on('end', () => resolve(buf));
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

describe('StreamableHTTPClientTransport — lifecycle', () => {
  it('start() sets up the transport without error', async () => {
    const t = new StreamableHTTPClientTransport('http://127.0.0.1:9/unused');
    await t.start();
    await t.close();
  });

  it('start() throws if called a second time', async () => {
    const t = new StreamableHTTPClientTransport('http://127.0.0.1:9/unused');
    await t.start();
    await assert.rejects(() => t.start(), /already started/i);
    await t.close();
  });

  it('close() fires onclose callback', async () => {
    const t = new StreamableHTTPClientTransport('http://127.0.0.1:9/unused');
    await t.start();
    let closed = false;
    t.onclose = () => { closed = true; };
    await t.close();
    assert.equal(closed, true);
  });
});

// ---------------------------------------------------------------------------
// send() — JSON response
// ---------------------------------------------------------------------------

describe('StreamableHTTPClientTransport — JSON response', () => {
  let server;

  before(async () => {
    server = await makeServer(async (req, res) => {
      const body = await readBody(req);
      const msg = JSON.parse(body);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('mcp-session-id', 'test-session-abc');
      const reply = JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { ok: true } });
      res.writeHead(200, { 'Content-Length': Buffer.byteLength(reply) });
      res.end(reply);
    });
  });

  after(() => server.stop());

  it('sends a POST request with correct headers and JSON body', async () => {
    // Capture what the server actually receives
    let capturedHeaders;
    let capturedBody;
    const capServer = await makeServer(async (req, res) => {
      capturedHeaders = req.headers;
      capturedBody = await readBody(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const reply = JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} });
      res.end(reply);
    });

    try {
      const t = new StreamableHTTPClientTransport(capServer.url);
      await t.start();
      t.onmessage = () => {};
      await t.send({ jsonrpc: '2.0', id: 1, method: 'ping' });
      await t.close();

      assert.equal(capturedHeaders['content-type'], 'application/json');
      assert.ok(capturedHeaders['accept'].includes('application/json'));
      const parsed = JSON.parse(capturedBody);
      assert.equal(parsed.method, 'ping');
      assert.equal(parsed.id, 1);
    } finally {
      await capServer.stop();
    }
  });

  it('calls onmessage with the parsed JSON response', async () => {
    const t = new StreamableHTTPClientTransport(server.url);
    await t.start();
    const received = [];
    t.onmessage = (m) => received.push(m);
    await t.send({ jsonrpc: '2.0', id: 42, method: 'ping' });
    await t.close();
    assert.equal(received.length, 1);
    assert.equal(received[0].id, 42);
    assert.deepEqual(received[0].result, { ok: true });
  });

  it('captures mcp-session-id from the response header', async () => {
    const t = new StreamableHTTPClientTransport(server.url);
    await t.start();
    t.onmessage = () => {};
    assert.equal(t.sessionId, null);
    await t.send({ jsonrpc: '2.0', id: 1, method: 'ping' });
    assert.equal(t.sessionId, 'test-session-abc');
    await t.close();
  });

  it('includes mcp-session-id header in subsequent requests once set', async () => {
    let seenSessionHeader;
    const s = await makeServer(async (req, res) => {
      seenSessionHeader = req.headers['mcp-session-id'];
      const body = await readBody(req);
      const msg = JSON.parse(body);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('mcp-session-id', 'my-session');
      const reply = JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} });
      res.writeHead(200);
      res.end(reply);
    });
    try {
      const t = new StreamableHTTPClientTransport(s.url, { sessionId: 'my-session' });
      await t.start();
      t.onmessage = () => {};
      await t.send({ jsonrpc: '2.0', id: 1, method: 'ping' });
      assert.equal(seenSessionHeader, 'my-session');
      await t.close();
    } finally {
      await s.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// send() — 202 Accepted (notifications)
// ---------------------------------------------------------------------------

describe('StreamableHTTPClientTransport — 202 notification', () => {
  it('returns without calling onmessage when server responds 202', async () => {
    const s = await makeServer(async (req, res) => {
      await readBody(req);
      res.writeHead(202);
      res.end();
    });
    try {
      const t = new StreamableHTTPClientTransport(s.url);
      await t.start();
      let called = false;
      t.onmessage = () => { called = true; };
      await t.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      await t.close();
      assert.equal(called, false);
    } finally {
      await s.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// send() — SSE response
// ---------------------------------------------------------------------------

describe('StreamableHTTPClientTransport — SSE response', () => {
  it('calls onmessage with data parsed from an SSE body', async () => {
    const ssePayload = { jsonrpc: '2.0', id: 7, result: { sse: true } };
    const s = await makeServer(async (req, res) => {
      await readBody(req);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      });
      res.write(`data: ${JSON.stringify(ssePayload)}\n\n`);
      res.end();
    });
    try {
      const t = new StreamableHTTPClientTransport(s.url);
      await t.start();
      const received = [];
      t.onmessage = (m) => received.push(m);
      await t.send({ jsonrpc: '2.0', id: 7, method: 'ping' });
      await t.close();
      assert.equal(received.length, 1);
      assert.deepEqual(received[0].result, { sse: true });
    } finally {
      await s.stop();
    }
  });

  it('ignores non-JSON SSE data lines without throwing', async () => {
    const s = await makeServer(async (req, res) => {
      await readBody(req);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: not-json\n\n');
      res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id: 8, result: {} })}\n\n`);
      res.end();
    });
    try {
      const t = new StreamableHTTPClientTransport(s.url);
      await t.start();
      const received = [];
      t.onmessage = (m) => received.push(m);
      await t.send({ jsonrpc: '2.0', id: 8, method: 'ping' });
      await t.close();
      // Only the valid JSON SSE event should arrive
      assert.equal(received.length, 1);
      assert.equal(received[0].id, 8);
    } finally {
      await s.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// send() — HTTP errors
// ---------------------------------------------------------------------------

describe('StreamableHTTPClientTransport — HTTP errors', () => {
  it('throws and calls onerror on a 4xx response', async () => {
    const s = await makeServer(async (req, res) => {
      await readBody(req);
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Unauthorized');
    });
    try {
      const t = new StreamableHTTPClientTransport(s.url);
      await t.start();
      const errors = [];
      t.onerror = (e) => errors.push(e);
      await assert.rejects(() => t.send({ jsonrpc: '2.0', id: 1, method: 'ping' }), /401/);
      assert.equal(errors.length, 1);
      await t.close();
    } finally {
      await s.stop();
    }
  });

  it('throws on a 500 response', async () => {
    const s = await makeServer(async (req, res) => {
      await readBody(req);
      res.writeHead(500);
      res.end('Internal Server Error');
    });
    try {
      const t = new StreamableHTTPClientTransport(s.url);
      await t.start();
      t.onerror = () => {};
      await assert.rejects(() => t.send({ jsonrpc: '2.0', id: 1, method: 'ping' }), /500/);
      await t.close();
    } finally {
      await s.stop();
    }
  });
});
