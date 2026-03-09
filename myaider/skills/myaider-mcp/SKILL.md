---
name: myaider-mcp
version: 0.1.0
description: >
  Connect to the MyAider MCP server and invoke its tools using the myaider_mcp
  agent tool. Use this skill when the user wants to interact with MyAider tools
  directly, list available MyAider tools, or when another skill requires
  MyAider MCP capabilities.
metadata:
  openclaw:
    homepage: https://www.myaider.ai/mcp
    emoji: "🤖"
---

# MyAider MCP Client

This skill enables your OpenClaw agent to connect to the [MyAider](https://www.myaider.ai) MCP server and invoke its tools via the `myaider_mcp` agent tool registered by the MyAider plugin.

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

Shortcut for calling `get_myaider_skill_updates` — returns skills with their latest `updated_at` timestamps (used by the upgrade workflow).

## Example Usage

- "List the tools available in my MyAider MCP"
- "Call the MyAider tool [tool-name] with arguments [args]"
- "Get my MyAider skills"

## Error Handling

- If the plugin is not configured, the tool returns an error message with setup instructions.
- If the MCP server is unreachable, inform the user and suggest verifying their `url` setting at https://www.myaider.ai/mcp.
- If a required tool argument is missing, ask the user to provide it before retrying.
