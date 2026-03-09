---
name: myaider-skill-importer
description: >
  Import, create, and upgrade skills from MyAider MCP. Use this skill whenever
  the user wants to import their MyAider MCP skills into agent skills, or
  upgrade/update existing MyAider skills to the latest version. This skill
  uses the myaider_mcp tool (provided by myaider) to retrieve
  available skills, presents them to the user for selection, and uses
  skill-creator to create or update each selected skill properly.
compatibility: []
---

# MyAider Skill Importer

## Purpose
Automate the process of importing skills from the MyAider MCP server into agent skills. This skill retrieves available skills via the `myaider_mcp` tool, lets the user choose which ones to import, and creates proper skill files for each using the existing skill-creator skill.

## Prerequisites

The **myaider** plugin must be installed and configured. If the `myaider_mcp` tool is not available or returns a configuration error, direct the user to:

1. Install the plugin: `openclaw plugins install ./myaider` (or from GitHub)
2. Configure their MCP URL in `openclaw.json`:
   ```json
   {
     "plugins": {
       "entries": {
         "myaider": {
           "enabled": true,
           "config": { "url": "https://myaider.ai/api/v1/mcp?apiKey=<your-api-key>" }
         }
       }
     }
   }
   ```
3. Get their URL from **https://www.myaider.ai/mcp**
4. Restart: `openclaw gateway restart`

Also check if `skill-creator` skill is available; if not, ask the user to install it.

## MANDATORY WORKFLOW

### Step 0 — REQUIRED: Verify plugin and skill-creator availability

1. **Check the `myaider_mcp` tool** is available by calling it with `action=list`:
   - If it returns an error about missing configuration, show the prerequisites above and stop.
   - If it succeeds, proceed silently to Step 1.

2. **Check skill-creator** is available. If not, ask the user to install it.

### Step 1 — REQUIRED: Get Available Skills

Call the `myaider_mcp` tool with `action=get_skills` (which invokes `get_myaider_skills` on the MyAider MCP server) to retrieve all available skills.

### Step 2 — REQUIRED: Present Skills to User
Present the list of skills to the user with their descriptions. Ask them to choose:
- "All" - import every skill
- Or specify which specific skills they want (by name)

Wait for user confirmation before proceeding.

### Step 3 — REQUIRED: For Each Selected Skill
For each skill the user wants to import:

1. **Extract the skill specification** from the `get_skills` result:
   - Skill name
   - Description (from the Usage Instructions or summary)
   - Usage Instructions (the main content)
   - **Tools with FULL usage details**: Extract each tool's name, description, and parameter schema from the "Tools" section in the result

2. **Create a properly formatted skill using skill-creator**:
   YOU MUST create the skill automatically instead of ask the user to do it manually. YOU MUST use the Skill tool to invoke `skill-creator:skill-creator` with this template:

   ```
   Create a new skill called "[skill-name]" based on the following specification:

   ## Skill Name
   [skill-name]

   ## Description
   [description - make it comprehensive with triggering guidance]

   ## Metadata
   Add the following fields to the skill's YAML frontmatter (in addition to name and description):
   - source: myaider
   - updated_at: [ISO 8601 timestamp from the remote skill, e.g. 2026-03-06T12:00:00Z]

   ## Usage Instructions
   [full usage instructions from the myaider skill]

   ## How to Invoke Tools
   This skill's tools are accessed via the `myaider_mcp` agent tool (registered by myaider).
   Use: myaider_mcp(action="call", tool="<tool-name>", args={...})

   ## Tools
   The following tools are available via myaider_mcp. Include their full descriptions and parameter
   schemas to optimize token usage (no MCP introspection needed at runtime):

   ### [tool-name-1]
   [full tool description from get_skills result]

   **Parameters:**
   [parameter schema - include all parameters with their types, required/optional status, and descriptions]

   ### [tool-name-2]
   [full tool description from get_skills result]

   **Parameters:**
   [parameter schema - include all parameters with their types, required/optional status, and descriptions]
   ```

   **Critical**: The extracted tool descriptions and schemas must be included directly in the skill to avoid overhead. The created skill should invoke tools via `myaider_mcp(action="call", tool="<name>", args={...})`.

3. **Confirm creation** to the user after each skill is created

### Step 4 — REQUIRED: Summarize
After all selected skills are created, provide a summary:
- List of successfully created skills
- File locations
- Any skills that failed (if any)

---

## Upgrade Workflow

Trigger this workflow when the user asks to **upgrade**, **update**, or **sync** their MyAider skills.

### Upgrade Step 0 — Verify plugin availability
Same as Step 0. If the `myaider_mcp` tool returns a configuration error, show prerequisites and stop.

### Upgrade Step 1 — Fetch remote update info
Call `myaider_mcp` with `action=get_skill_updates` (which invokes `get_myaider_skill_updates`). This returns the latest skill definitions with their `updated_at` timestamps.

### Upgrade Step 2 — Read local MyAider skills
Find all locally installed skills that have `source: myaider` in their YAML frontmatter. For each, read the `updated_at` value. Build a map of `skill-name → local updated_at`.

### Upgrade Step 3 — Compare and classify
For each skill returned in Upgrade Step 1:
- **Remote `updated_at` is newer than local** → mark for **upgrade**
- **Skill does not exist locally** → mark for **new install**
- **Remote `updated_at` is same or older** → skip (already up to date)

Present the classification to the user (what will be upgraded, what is new, what is already current) and ask for confirmation before proceeding.

### Upgrade Step 4 — Upgrade outdated skills
For each skill marked for **upgrade**, invoke `skill-creator:skill-creator` with the full updated specification (same template as Step 3, including refreshed `updated_at` and tool schemas). skill-creator will overwrite the existing skill file.

### Upgrade Step 5 — Install new skills
For each skill marked for **new install**, invoke `skill-creator:skill-creator` exactly as in the main Step 3 (import workflow).

### Upgrade Step 6 — Summarize
Provide a final report:
- Skills upgraded (name + old → new `updated_at`)
- New skills installed
- Skills already up to date (skipped)
- Any failures

---

## Important Constraints
- Always use the `myaider_mcp` agent tool — never call MCP server URLs directly
- Always call `myaider_mcp(action="get_skills")` after confirming the plugin is configured — do NOT guess what skills are available
- **Always extract and include FULL tool descriptions and schemas** from the `get_skills` result — this optimizes token usage; created skills should NOT need MCP introspection at runtime
- Always include `source: myaider` and `updated_at` in the YAML frontmatter of every created or upgraded skill — these fields are required for the upgrade workflow
- Always wait for user confirmation before creating or upgrading skills
- Create/upgrade skills one at a time using skill-creator
- Keep the skill-creator conversation focused on each skill creation

## Example Usage
- "Import my MyAider skills"
- "Create skills from myaider"
- "Set up the skills from my MyAider MCP"
- "Upgrade my MyAider skills"
- "Update my MyAider skills to the latest version"
- "Sync my MyAider skills"
