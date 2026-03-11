---
name: myaider
description: "Connect to the MyAider MCP server, invoke its tools, and manage MyAider skills. Use this skill to list or call MyAider MCP tools, or to import, download, add, upgrade, or sync MyAider skills into OpenClaw."
metadata: {"openclaw":{"homepage":"https://www.myaider.ai","emoji":"🤖"}}
---

# MyAider

This skill enables your OpenClaw agent to connect to the [MyAider](https://www.myaider.ai) MCP server via the `myaider_mcp` agent tool and to manage skills from MyAider.

Skills from MyAider are **automatically downloaded** into the plugin's `skills-dynamic/` directory whenever the plugin loads. They can also be re-synced on demand by the agent at any time.

## Prerequisites

The **myaider** plugin must be installed and configured with your MyAider MCP URL:

1. Visit **https://www.myaider.ai/mcp** to obtain your personal MCP server URL.
2. Add the following to your `openclaw.json`:
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
3. Restart the OpenClaw gateway: `openclaw gateway restart`

## Using the `myaider_mcp` Tool

The plugin registers the **`myaider_mcp`** agent tool. Use it with the following actions:

### List available tools

```json
{ "action": "list" }
```

Returns all tools exposed by the MyAider MCP server with their names, descriptions, and parameter schemas.

### Call a specific tool

```json
{ "action": "call", "tool": "<tool-name>", "args": { ... } }
```

Invokes any tool available on the MyAider MCP server.

### Get MyAider skills

```json
{ "action": "get_skills" }
```

Shortcut for calling `get_myaider_skills` — returns all available skills from MyAider.

### Get skill update information

```json
{ "action": "get_skill_updates" }
```

Shortcut for calling `get_myaider_skill_updates` — returns skills with their latest `updated_at` timestamps.

## Interpreting MCP Tool Instructions from MyAider Skills

MyAider skills (both auto-downloaded and manually synced) reference MCP tool names directly in
their instructions, for example `logfire__alert_status` or `logfire__query_run`. These are **MCP
tool names**, not native OpenClaw agent tools.

**Always translate them into `myaider_mcp` calls:**

| Skill instruction says | What you must do in OpenClaw |
|---|---|
| Call `some_tool` with `{ ... }` | `myaider_mcp` → `{ "action": "call", "tool": "some_tool", "args": { ... } }` |
| Use tool `some_tool` | `myaider_mcp` → `{ "action": "call", "tool": "some_tool", "args": {} }` |

**Example** — a downloaded skill says:

> Call `logfire__alert_status` with parameters `{ "service": "auth-service", "time_window": "15m" }`.

You must execute this as:

```json
{ "action": "call", "tool": "logfire__alert_status", "args": { "service": "auth-service", "time_window": "15m" } }
```

via the `myaider_mcp` agent tool. **Never** invoke MCP tool names as if they were native OpenClaw
tools — they do not exist as direct tools. The `myaider_mcp` tool is the only gateway to the
MyAider MCP server.

## Downloading and Syncing Skills

Skills are automatically synced when the plugin loads. To manually trigger a sync (import new skills or upgrade existing ones):

### Sync (import or upgrade) all skills

```json
{ "action": "sync_skills" }
```

Fetches all available skills from the MyAider MCP server and writes their `SKILL.md` files directly into the plugin's `skills-dynamic/` directory. This is both the import and the upgrade workflow — it always writes the latest version of every skill, so running it again upgrades any previously downloaded skills.

- **Success** → report the synced skill names to the user. OpenClaw's skills watcher picks up the new files automatically; a gateway restart may be needed for a full reload.
- **Error** → show the error message and ask the user to verify their MCP URL and network access.

### Verify plugin, then sync

When the user asks to import or upgrade skills, first verify the plugin is available:

1. Call `myaider_mcp` with `{ "action": "list" }`.
   - **Success** → proceed to sync.
   - **Error** → show setup instructions (see Prerequisites above) and stop.
2. Call `myaider_mcp` with `{ "action": "sync_skills" }`.
3. Report the result: skills written, any failures, and whether a gateway restart is recommended.

## Error Handling

- If the plugin is not configured, the tool returns an error message with setup instructions.
- If the MCP server is unreachable, inform the user and suggest verifying their `url` setting at https://www.myaider.ai/mcp.
- If a required tool argument is missing, ask the user to provide it before retrying.

## Example Usage

- "List the tools available in my MyAider MCP"
- "Call the MyAider tool [tool-name] with arguments [args]"
- "Get my MyAider skills"
- "Import my MyAider skills"
- "Download skills from MyAider"
- "Add skills from myaider"
- "Upgrade my MyAider skills"
- "Update my MyAider skills to the latest version"
- "Sync my MyAider skills"
