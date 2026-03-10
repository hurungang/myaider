# myaider

**[MyAider.ai](https://www.myaider.ai)** is probably the first **skillful MCP hub**. Instead of relying on tool descriptions and schemas at runtime, MyAider uses **tool-based skills** — pre-built skill files that already contain all the instructions and tool details agents need. This means:

- 🚀 **Zero token overhead** — tools on the MCP server have no descriptions or schemas; all the knowledge is embedded in skill files.
- 🧠 **Skill-driven tool use** — skills tell the agent exactly how to call each tool, so no MCP introspection is needed at runtime.
- 📦 **Living skill library** — import, upgrade, and sync skills directly from [myaider.ai](https://www.myaider.ai), keeping your agent up to date automatically.

This repository provides the **myaider** plugin for [OpenClaw](https://openclaw.ai), connecting OpenClaw agents to the MyAider MCP hub.

---

## What does the plugin do?

- Implements a native MCP HTTP client so OpenClaw agents can talk to the MyAider MCP server.
- Registers the **`myaider_mcp`** agent tool for calling MyAider tools directly.
- Provides two skills:
  - **`myaider-mcp`** — lets agents list and call tools on the MyAider MCP server.
  - **`myaider-skill-importer`** — imports and upgrades dynamic skills from MyAider into OpenClaw.

---

## Installation

```bash
openclaw plugins install myaider
```

Or install from source:

```bash
cd ~/.openclaw/extensions/
git clone https://github.com/hurungang/myaider
cd myaider/myaider
npm install
openclaw gateway restart
```

---

## Quick Start

1. **Get your MyAider MCP URL** from [https://www.myaider.ai/mcp](https://www.myaider.ai/mcp).

2. **Configure the plugin** — either via CLI:

   ```bash
   openclaw config set plugins.entries.myaider.config.url "https://myaider.ai/api/v1/mcp?apiKey=<your-api-key>"
   ```

   or by editing `~/.openclaw/openclaw.json`:

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

3. **Restart the gateway**:

   ```bash
   openclaw gateway restart
   ```

4. **Try it in OpenClaw chat**:

   ```
   List the tools available in my MyAider MCP
   ```

   ```
   Import my MyAider skills
   ```

   ```
   Upgrade my MyAider skills to the latest version
   ```

---

## License

MIT