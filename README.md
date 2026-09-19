# unity-pi-agent-plugin

**Unity 6 game development plugin for [pi](https://github.com/earendil-works/pi-coding-agent)** — brings Unity's official agent skills plus pi-native editor tools into your pi sessions.

It combines:

- **31 official Unity skills** — curated by Unity Technologies (IAP, LevelPlay ads, URP/Render Graph, Tilemap, UI Toolkit, TextMeshPro, multiplayer, localization, audio, and more). These are standard [Agent Skills](https://agentskills.io/specification) that pi loads natively.
- **A pi extension** — a thin bridge over the official `unity` CLI, exposing it as pi tools (`unity_status`, `unity_command`, `unity_eval`, `unity_build`, `unity_test`) plus a `/unity:status` command. Same capability source as the official Claude/Codex plugin, with pi's TUI widgets on top.

> Compatible with **Unity 6+** (`6000.x`) and the **`unity` CLI (beta)**. Works wherever pi runs (Windows / macOS / Linux).

---

## What's inside

```
unity-pi-agent-plugin/
├── skills/                  # 31 official Unity agent skills (Unity Companion License)
│   ├── implement-in-app-purchases/
│   ├── tilemap-palette-create/
│   ├── migrate-birp-to-urp/
│   └── ... 28 more
├── extensions/
│   └── unity/index.ts       # pi extension: Unity tools + /unity:status
├── docs/install.md          # detailed install & troubleshooting
├── ATTRIBUTION.md
├── LICENSE                  # MIT (extension + tooling)
└── LICENSE-Unity.md         # Unity Companion License (skills/)
```

## Install

### 1. Install the `unity` CLI

The extension drives the official `unity` binary — same as the upstream plugin. Install it once (beta channel):

```bash
# macOS / Linux
curl -fsSL https://public-cdn.cloud.unity3d.com/hub/prod/cli/install.sh | UNITY_CLI_CHANNEL=beta bash

# Windows (PowerShell)
$env:UNITY_CLI_CHANNEL='beta'; irm https://public-cdn.cloud.unity3d.com/hub/prod/cli/install.ps1 | iex
```

Verify with `unity --version`.

### 2. Skills (the Unity knowledge)

Point pi at this repo's `skills/` directory. In `~/.pi/settings.json` (global) or `<project>/.pi/settings.json` (project-only):

```json
{
  "skills": ["/abs/path/to/unity-pi-agent-plugin/skills"]
}
```

pi recursively discovers every `SKILL.md` under that path. Restart pi and the 31 Unity skills appear — ask for a task in natural language, or force one with `/skill:<name>`.

### 3. Extension (the Unity tools)

Link the extension into pi's global extensions dir:

```bash
# Windows (Git Bash) / macOS / Linux — create a symlink so `git pull` updates it
mkdir -p ~/.pi/agent/extensions
ln -s "/abs/path/to/unity-pi-agent-plugin/extensions/unity" ~/.pi/agent/extensions/unity
```

Or test once without installing:

```bash
pi -e /abs/path/to/unity-pi-agent-plugin/extensions/unity/index.ts
```

pi loads TypeScript extensions via jiti — no build step needed.

## Usage

Once installed:

- **Automatic skills** — "add in-app purchases", "create a hex tile palette", "my pixel art jitters", "review my ScriptableRendererFeature" — pi picks the matching skill.
- **`/unity:status`** — shows detected project root, Unity version, scene/script/package counts, and installed editors in the TUI.
- **Tools** — the model can call these (all drive the real `unity` CLI):
  - `unity_status` — live Editor instances (port, project, version, PID, state).
  - `unity_command` — run a Pipeline command on a live Editor (`unity command <name>`); omit name to list commands.
  - `unity_eval` — eval C# in a live Editor (`unity command eval`); confirms first.
  - `unity_build` — headless build via `unity build` (`--target`/`--profile`/`--execute-method`); confirms first.
  - `unity_test` — EditMode/PlayMode tests via `unity test`; confirms first.

## Example

```
> /unity:status
CLI: unity found
project: D:\games\MyGame (Unity 6000.3.24f1)
live editors: MyGame v6000.3.24f1 :38412 [ready]

> add rewarded ads so players can earn coins
(pi loads the levelplay-unity-integration skill and guides the integration)
```

## Notes & license

- `skills/` is adapted from [Unity-Technologies/unity-agent-plugin](https://github.com/Unity-Technologies/unity-agent-plugin), © Unity Technologies, under the **Unity Companion License** — see [LICENSE-Unity.md](LICENSE-Unity.md) and [ATTRIBUTION.md](ATTRIBUTION.md).
- The `extensions/` directory and pi tooling are **MIT** — see [LICENSE](LICENSE).
- This is an unofficial community packaging; it is not affiliated with or endorsed by Unity Technologies.
