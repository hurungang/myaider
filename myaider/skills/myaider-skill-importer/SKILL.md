---
name: myaider-skill-importer
description: >
  Import, download, add, create, and upgrade skills from MyAider MCP. Use this skill
  whenever the user wants to import, download, add, or install their MyAider MCP skills
  into agent skills, or upgrade/update/sync existing MyAider skills to the latest version.
  This skill checks if the myaider plugin is installed and configured, then uses the
  built-in sync_skills action to create or update each skill file directly—no skill-creator
  required.
compatibility: []
---

# MyAider Skill Importer

## Purpose
Automate the process of importing and keeping skills from the MyAider MCP server up to date. This skill uses the `myaider_mcp` tool (provided by the myaider plugin) to fetch and write skill files directly—bypassing the `skill-creator` dependency entirely.

## MANDATORY WORKFLOW

### Step 0 — REQUIRED: Verify plugin availability

Call `myaider_mcp` with `{ "action": "list" }` to verify the plugin is installed and configured:

- **Success** (returns a list of tools) → proceed silently to Step 1.
- **Error / plugin not available** → inform the user:

  > The **myaider** plugin doesn't appear to be installed or configured.
  > To use this skill, set up the myaider plugin first:
  >
  > 1. Install the myaider OpenClaw plugin
  > 2. Configure your MCP URL in `openclaw.json`:
  >    ```json
  >    {
  >      "plugins": {
  >        "entries": {
  >          "myaider": {
  >            "enabled": true,
  >            "config": { "url": "https://myaider.ai/api/v1/mcp?apiKey=<your-api-key>" }
  >          }
  >        }
  >      }
  >    }
  >    ```
  > 3. Get your URL from **https://www.myaider.ai/mcp**
  > 4. Restart: `openclaw gateway restart`

  Do NOT proceed until the user confirms the plugin is configured.

### Step 1 — REQUIRED: Sync skills directly via the plugin

Call `myaider_mcp` with:
```json
{ "action": "sync_skills" }
```

This fetches all available skills from the MyAider MCP server and writes their `SKILL.md` files directly into the plugin's `skills-dynamic/` directory. No `skill-creator` is needed—the plugin handles file creation itself.

- **Success** → report the synced skill names to the user. OpenClaw's skills watcher picks up the new files automatically; a gateway restart may be needed for a full reload.
- **Error** → show the error message and ask the user to verify their MCP URL and network access.

### Step 2 — REQUIRED: Summarize

After `sync_skills` completes, present a summary to the user:
- Skills written (names)
- Skills that failed (if any)
- Whether a gateway restart is recommended to apply changes immediately

---

## Upgrade Workflow

Trigger this workflow when the user asks to **upgrade**, **update**, or **sync** their MyAider skills.

The `sync_skills` action always writes the latest version of every skill from the remote, so **it serves as both the import and the upgrade workflow**. Simply run:

### Upgrade Step 0 — Verify plugin availability
Same as Step 0 above. If `myaider_mcp` with `{ "action": "list" }` returns an error, show setup instructions and stop.

### Upgrade Step 1 — Re-sync skills
Call `myaider_mcp` with `{ "action": "sync_skills" }`. The plugin overwrites any existing skill files with the latest content from MyAider, effectively upgrading all skills in one step.

### Upgrade Step 2 — Summarize
Report the result to the user (skills written, any failures, restart recommendation).

---

## Important Constraints
- Always use the `myaider_mcp` agent tool — never call MCP server URLs directly
- Always call `myaider_mcp` with `{ "action": "list" }` first to verify the plugin is configured — do NOT skip this check
- Prefer `sync_skills` over the legacy skill-creator workflow — it is faster, more reliable, and requires no external dependencies
- Always confirm the result with the user after syncing

## Example Usage
- "Import my MyAider skills"
- "Download skills from MyAider"
- "Add skills from myaider"
- "Create skills from myaider"
- "Set up the skills from my MyAider MCP"
- "Upgrade my MyAider skills"
- "Update my MyAider skills to the latest version"
- "Sync my MyAider skills"
