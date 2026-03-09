# myaider

An OpenClaw plugin that integrates with [MyAider](https://www.myaider.ai) via MCP (Model Context Protocol). It implements a native MCP client and provides two skills:

1. **myaider-mcp** — basic MCP client skill that lets agents interact with the MyAider MCP server via the `myaider_mcp` tool.
2. **myaider-skill-importer** — a skill that downloads dynamic skills from the MyAider MCP server and installs them as local OpenClaw skills (using skill-creator), including upgrade/sync support.

---

## Overview

MyAider is an MCP hub that exposes a catalogue of skills as MCP tools. This plugin bridges MyAider and OpenClaw by:

- **Implementing a native MCP HTTP client** — OpenClaw does not support MCP natively; this plugin adds that capability.
- Registering the **`myaider_mcp` agent tool** so agents can call MyAider tools without knowing the underlying MCP protocol.
- Providing skills that teach agents how to use `myaider_mcp` to import and manage skills.

---

## File Structure

```
myaider/
├── README.md
├── package.json               # ESM Node package + @modelcontextprotocol/sdk dependency
├── openclaw.plugin.json       # OpenClaw plugin manifest
├── src/
│   ├── index.js               # Plugin entry point — registers myaider_mcp tool
│   └── http-transport.js      # MCP Streamable HTTP/SSE transport implementation
└── skills/
    ├── myaider-mcp/
    │   └── SKILL.md           # myaider-mcp skill
    └── myaider-skill-importer/
        └── SKILL.md           # myaider-skill-importer skill
```

---

## Installation

### Via OpenClaw CLI (recommended)

```bash
openclaw plugins install myaider
```

### From source

```bash
cd ~/.openclaw/extensions/
git clone https://github.com/hurungang/openclaw-plugins
cd openclaw-plugins/myaider
npm install
openclaw gateway restart
```

---

## Configuration

After installation, add your MyAider MCP URL to `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "myaider": {
        "enabled": true,
        "config": {
          "url": "https://myaider.ai/api/v1/mcp?apiKey=<your-api-key>"
        }
      }
    }
  }
}
```

Get your personal MCP URL from **https://www.myaider.ai/mcp**.

Then restart the gateway:

```bash
openclaw gateway restart
```

---

## The `myaider_mcp` Tool

The plugin registers a single **`myaider_mcp`** agent tool. Agents use it with the following actions:

| Action | Description |
|---|---|
| `list` | List all tools available on the MyAider MCP server |
| `call` | Call a specific tool by name |
| `get_skills` | Shortcut: call `get_myaider_skills` — returns all available skills |
| `get_skill_updates` | Shortcut: call `get_myaider_skill_updates` — returns skills with `updated_at` |

### Example agent calls

```json
// List available tools
{ "action": "list" }

// Get available MyAider skills
{ "action": "get_skills" }

// Call any tool directly
{ "action": "call", "tool": "some_myaider_tool", "args": { "key": "value" } }
```

---

## Skills

### `myaider-mcp`

Teaches agents how to use the `myaider_mcp` tool, including setup verification and error handling.

**Trigger examples:**
- "List the tools available in my MyAider MCP"
- "Call the MyAider tool [tool-name]"
- "Get my MyAider skills"

---

### `myaider-skill-importer`

Imports skills from the MyAider MCP server and creates local OpenClaw skill files using `skill-creator`.

**Import workflow:**
1. Calls `myaider_mcp(action="get_skills")` to fetch available skills
2. Presents skills to the user for selection
3. Creates each selected skill as a local file with full tool schemas embedded (token-efficient)

**Upgrade workflow:**
1. Calls `myaider_mcp(action="get_skill_updates")` to fetch latest skill versions
2. Compares remote `updated_at` timestamps against local skills (`source: myaider`)
3. Upgrades outdated skills and installs new ones after user confirmation

**Trigger examples:**
- "Import my MyAider skills"
- "Upgrade my MyAider skills"
- "Sync my MyAider skills to the latest version"

> **Requirement:** The `skill-creator` skill must be installed. If unavailable, the importer will prompt you to install it first.

---

## Architecture

```
OpenClaw Agent
     │
     │  uses tool: myaider_mcp
     ▼
myaider_mcp (registered by plugin)
     │
     │  HTTP/SSE (MCP Streamable HTTP protocol)
     ▼
MyAider MCP Server (https://myaider.ai/api/v1/mcp?apiKey=<your-api-key>)
     │
     └─► get_myaider_skills, get_myaider_skill_updates, ...
```

### MCP Client Implementation

- **`src/http-transport.js`** — implements `StreamableHTTPClientTransport` (MCP Streamable HTTP spec: POST for requests, SSE for server-initiated messages, `mcp-session-id` header for session continuity)
- **`src/index.js`** — wraps the transport in `MyAiderMCPManager`, performs lazy connection on first tool call (satisfying OpenClaw's synchronous `register()` requirement), and registers the `myaider_mcp` tool

---

## License

MIT
