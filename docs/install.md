# Install & Troubleshooting

## Prerequisites

- [pi](https://github.com/earendil-works/pi-coding-agent) installed and working.
- The **`unity` CLI (beta)** — the extension calls this binary for all Unity operations.
- Unity 6 (`6000.x`) installed via Unity Hub (for editor builds/tests and live control).
- `git` to clone and update this repo.

## Get the repo

```bash
git clone https://github.com/Smith-106/unity-pi-agent-plugin.git
cd unity-pi-agent-plugin
```

Keep it somewhere stable — the skills path you configure points at this clone, and `git pull` updates it.

## Install the skills

Add this repo's `skills/` directory to pi settings.

**Global** — `~/.pi/settings.json`:

```json
{
  "skills": ["C:/Users/<you>/path/to/unity-pi-agent-plugin/skills"]
}
```

**Project-scoped** — `<your-unity-project>/.pi/settings.json` (use a relative or absolute path):

```json
{
  "skills": ["../unity-pi-agent-plugin/skills"]
}
```

Restart pi. Skills show up under `/skill:` and are auto-selected by task.

## Install the extension

pi auto-discovers extensions at `~/.pi/agent/extensions/*/index.ts`. Link this repo's extension there so updates are a `git pull`:
```bash
mkdir -p ~/.pi/agent/extensions
ln -s "C:/Users/<you>/path/to/unity-pi-agent-plugin/extensions/unity" \
      ~/.pi/agent/extensions/unity
```

On Windows, if symlinks aren't permitted, copy the folder instead (you'll re-copy to update):

```bash
cp -r "path/to/unity-pi-agent-plugin/extensions/unity" ~/.pi/agent/extensions/unity
```

Verify: run `pi`, then `/unity:status` inside a Unity project directory.

## One-off test (no install)

```bash
pi -e /path/to/unity-pi-agent-plugin/extensions/unity/index.ts
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Skills not listed | Path in `skills` must point at the directory that *contains* the `*/SKILL.md` folders. Use an absolute path. Restart pi after editing settings. |
| `/unity:status` unknown | Extension dir must be `~/.pi/agent/extensions/unity/index.ts` (a directory with `index.ts`, not a loose `.ts`). Run `/reload` after adding. |
| `unity_status` / `unity_command` report "no instances" | Open the project in a Unity Editor with the `com.unity.pipeline` package, or run `unity pipeline install`. Batch Editors don't appear in `status` — use `unity command`/`unity list` to confirm reachability. |
| Live control (`unity_eval`) fails | The project's Pipeline package isn't loaded. If the Editor is in Safe Mode (compile errors), fix the errors first — see the `unity-cli` skill's Safe-Mode notes. |
| `unity_build`/`unity_test` fail | These spawn a headless Editor — ensure the target/editor version in `ProjectSettings/ProjectVersion.txt` is installed via `unity editors`. |
| Windows symlink fails | Enable Developer Mode, or copy the folder instead of linking. |

## Live Editor control via MCP (optional)

The `unity` CLI ships a built-in MCP server (`unity mcp`) that exposes a running Editor's Pipeline commands as MCP tools — the same mechanism the official Claude/Codex plugin uses. pi reaches it through its MCP gateway.

Add a stdio server entry to `~/.config/mcp/mcp.json`:

```json
{
  "mcpServers": {
    "unity": {
      "type": "stdio",
      "command": "C:\\Users\\<you>\\AppData\\Local\\Unity\\bin\\unity.exe",
      "args": ["mcp"]
    }
  }
}
```

Restart pi (or reload the gateway) so the server is picked up. When a Unity Editor is open with the `com.unity.pipeline` package installed, its commands appear as MCP tools; with none running, `tools/list` is empty — expected.

Note: the tools are also reachable without MCP via this extension's `unity_command` / `unity_eval` (which call `unity command`/`unity command eval` directly).

## Updating

```bash
cd unity-pi-agent-plugin && git pull
# if you symlinked the extension, you're done.
# if you copied it, re-copy extensions/unity into ~/.pi/agent/extensions/
```
