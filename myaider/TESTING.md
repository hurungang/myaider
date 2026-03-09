# Testing the MyAider Plugin in OpenClaw

Step-by-step validation guide for the `myaider` plugin.

---

## 1. Install the plugin

```bash
openclaw plugins install myaider
```

Or from source:

```bash
cd ~/.openclaw/extensions/
git clone https://github.com/hurungang/openclaw-plugins
cd openclaw-plugins/myaider
npm install
```

## 2. Configure your MCP URL

Get your personal MCP URL from **https://www.myaider.ai/mcp**, then add it to `~/.openclaw/openclaw.json`:

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

## 3. Restart the gateway

```bash
openclaw gateway restart
```

Check the startup logs for the confirmation line:

```
[MyAider MCP] Plugin registered
```

If you see a warning like `No MCP URL configured`, the `url` field is missing from your config.

---

## 4. Validate in OpenClaw chat

Open an OpenClaw chat and run these prompts in order.

### Check the plugin loaded

```
List the tools available in my MyAider MCP
```

Expected: the agent calls `myaider_mcp` with `action=list` and returns a JSON list of tools including at least `get_myaider_skills` and `get_myaider_skill_updates`.

### Fetch available skills

```
Get my MyAider skills
```

Expected: the agent calls `myaider_mcp` with `action=get_skills` and returns a list of skills with their descriptions.

### Import a skill

```
Import my MyAider skills
```

Expected: the `myaider-skill-importer` skill kicks in, presents the list of available skills, asks which to import, then uses `skill-creator` to generate skill files locally.

### Check for upgrades

```
Upgrade my MyAider skills
```

Expected: the importer fetches `get_myaider_skill_updates`, compares timestamps against local files, and reports which skills are up to date or need upgrading.

---

## 5. Confirm the connection in logs

```bash
openclaw logs | grep 'MyAider MCP'
```

On successful connection you'll see:

```
[MyAider MCP] Connecting to https://myaider.ai/api/v1/mcp?apiKey=...
[MyAider MCP] Connected — N tool(s) available
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `No MCP URL configured` warning at startup | Add `url` to `plugins.entries.myaider.config` |
| `MyAider MCP URL not configured` error in chat | Same as above; plugin loaded but URL is missing |
| `fetch failed` / connection refused | Verify your MyAider MCP URL at https://www.myaider.ai/mcp |
| Plugin not found | Check `openclaw plugins list`; ensure the directory is under `~/.openclaw/extensions/` |
| `skill-creator not found` during import | Install the skill-creator skill first |
