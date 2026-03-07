/**
 * Streamable HTTP Transport for MyAider MCP client.
 *
 * Implements the MCP Streamable HTTP transport specification:
 *   - POST requests carry JSON-RPC messages
 *   - Responses may be JSON or an SSE stream
 *   - Session state is maintained via the `mcp-session-id` header
 */

export class StreamableHTTPClientTransport {
  constructor(url, options = {}) {
    this._url = url instanceof URL ? url : new URL(url);
    this._sessionId = options.sessionId ?? null;
    this._debug = options.debug ?? false;
    this._abortController = null;
    this._sseAbortController = null;
  }

  async start() {
    if (this._abortController) {
      throw new Error('Transport already started');
    }
    this._abortController = new AbortController();
    this._log('Transport started');
  }

  async close() {
    this._log('Closing transport');
    this._sseAbortController?.abort();
    this._abortController?.abort();
    this._sseAbortController = null;
    this._abortController = null;
    if (this.onclose) this.onclose();
  }

  async send(message) {
    this._log(`Sending: ${JSON.stringify(message).slice(0, 200)}`);

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (this._sessionId) {
      headers['mcp-session-id'] = this._sessionId;
    }

    let response;
    try {
      response = await fetch(this._url, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        signal: this._abortController?.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (this.onerror) this.onerror(err);
      throw err;
    }

    // Persist session ID from server
    const sid = response.headers.get('mcp-session-id');
    if (sid) {
      this._sessionId = sid;
      this._log(`Session ID: ${sid}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const err = new Error(`HTTP ${response.status}: ${body || response.statusText}`);
      if (this.onerror) this.onerror(err);
      throw err;
    }

    // 202 Accepted — notification was accepted (no body)
    if (response.status === 202) {
      // body.cancel() releases the stream; errors here are safe to ignore
      await response.body?.cancel().catch(() => {});
      if (message.method === 'notifications/initialized') {
        this._openSseStream();
      }
      return;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/event-stream')) {
      await this._readSseBody(response.body);
    } else if (contentType.includes('application/json')) {
      const data = await response.json();
      const messages = Array.isArray(data) ? data : [data];
      for (const msg of messages) {
        if (this.onmessage) this.onmessage(msg);
      }
    } else {
      // Unexpected content-type; release the stream — errors here are safe to ignore
      await response.body?.cancel().catch(() => {});
    }
  }

  // -------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------

  _openSseStream() {
    this._log('Opening GET SSE stream');
    this._sseAbortController = new AbortController();

    fetch(this._url, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        ...(this._sessionId ? { 'mcp-session-id': this._sessionId } : {}),
      },
      signal: this._sseAbortController.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 405) return; // server doesn't support GET SSE
          throw new Error(`GET SSE failed: HTTP ${res.status}`);
        }
        this._log('GET SSE stream opened');
        await this._readSseBody(res.body);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          this._log(`GET SSE error: ${err.message}`);
          if (this.onerror) this.onerror(err);
        }
      });
  }

  async _readSseBody(body) {
    if (!body) return;
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const { parsed, remaining } = parseSseEvents(buf);
        buf = remaining;
        for (const ev of parsed) {
          if (!ev.data) continue;
          try {
            const msg = JSON.parse(ev.data);
            if (this.onmessage) this.onmessage(msg);
          } catch {
            this._log(`Skipping non-JSON SSE data: ${ev.data.slice(0, 100)}`);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError' && this.onerror) this.onerror(err);
    }
  }

  _log(msg) {
    if (this._debug) console.log(`[MyAiderTransport] ${msg}`);
  }

  get sessionId() { return this._sessionId; }
}

/**
 * Parse SSE events from a raw text buffer.
 * Returns `{ parsed: Event[], remaining: string }`.
 */
function parseSseEvents(buffer) {
  const parsed = [];
  const parts = buffer.split(/\n\n|\r\n\r\n/);
  const remaining = parts.pop() ?? '';

  for (const part of parts) {
    if (!part.trim()) continue;
    const event = { event: null, data: '', id: null };
    for (const line of part.split(/\n|\r\n/)) {
      const l = line.replace(/\r$/, '');
      if (l.startsWith('data:')) {
        const d = l.slice(5).trimStart();
        event.data = event.data ? `${event.data}\n${d}` : d;
      } else if (l.startsWith('event:')) {
        event.event = l.slice(6).trim();
      } else if (l.startsWith('id:')) {
        event.id = l.slice(3).trim();
      }
    }
    if (event.data) parsed.push(event);
  }
  return { parsed, remaining };
}
