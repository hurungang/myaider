# openclaw-plugins

A collection of community plugins for [OpenClaw](https://openclaw.ai) — the AI-powered coding assistant and agent platform.

---

## What is OpenClaw?

OpenClaw is an AI agent platform with a plugin system that allows extending its capabilities through custom tools and skills. Plugins can register new agent tools, add skills, and integrate with external services.

---

## Available Plugins

### [`myaider`](./myaider)

Connects OpenClaw to the [MyAider](https://www.myaider.ai) MCP (Model Context Protocol) server. This plugin:

- Implements a native MCP HTTP client so OpenClaw agents can communicate with the MyAider MCP server.
- Registers the **`myaider_mcp`** agent tool for calling MyAider tools directly.
- Provides two skills:
  - **`myaider-mcp`** — lets agents list and call tools on the MyAider MCP server.
  - **`myaider-skill-importer`** — imports and upgrades dynamic skills from MyAider into OpenClaw.

See the [myaider plugin README](./myaider/README.md) for full documentation.

---

## Installation

### Install a plugin via OpenClaw CLI (recommended)

```bash
openclaw plugins install myaider
```

### Install from source

```bash
cd ~/.openclaw/extensions/
git clone https://github.com/hurungang/openclaw-plugins
cd openclaw-plugins/myaider
npm install
openclaw gateway restart
```

---

## Quick Start: myaider plugin

1. **Install the plugin** (see above).

2. **Get your MyAider MCP URL** from [https://www.myaider.ai/mcp](https://www.myaider.ai/mcp).

3. **Add the URL to `~/.openclaw/openclaw.json`**:

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

4. **Restart the gateway**:

   ```bash
   openclaw gateway restart
   ```

5. **Try it in OpenClaw chat**:

   ```
   List the tools available in my MyAider MCP
   ```

---

## Repository Structure

```
openclaw-plugins/
└── myaider/               # MyAider MCP plugin
    ├── README.md          # Full plugin documentation
    ├── TESTING.md         # Step-by-step testing guide
    ├── package.json
    ├── openclaw.plugin.json
    ├── src/
    │   ├── index.js       # Plugin entry point
    │   └── http-transport.js
    └── skills/
        ├── myaider-mcp/
        └── myaider-skill-importer/
```

---

## Contributing

Pull requests and new plugin contributions are welcome. Each plugin lives in its own subdirectory with its own `package.json`, `openclaw.plugin.json`, and `README.md`.

---

## License

MIT