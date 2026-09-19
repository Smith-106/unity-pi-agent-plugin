# unity-pi-agent-plugin

**Unity 6 game development plugin for [pi](https://github.com/earendil-works/pi-coding-agent)** — brings Unity's official agent skills plus pi-native editor tools into your pi sessions.

It combines:

- **31 official Unity skills** — curated by Unity Technologies (IAP, LevelPlay ads, URP/Render Graph, Tilemap, UI Toolkit, TextMeshPro, multiplayer, localization, audio, and more). These are standard [Agent Skills](https://agentskills.io/specification) that pi loads natively.
- **A pi extension** — live tools that inspect your project and drive the Unity editor (`unity_detect_editors`, `unity_project_info`, `unity_run_batch`) plus a `/unity:status` command.

> Compatible with **Unity 6+** (`6000.x`). Works wherever pi runs (Windows / macOS / Linux).

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

### 1. Skills (the Unity knowledge)

Point pi at this repo's `skills/` directory. In `~/.pi/settings.json` (global) or `<project>/.pi/settings.json` (project-only):

```json
{
  "skills": ["/abs/path/to/unity-pi-agent-plugin/skills"]
}
```

pi recursively discovers every `SKILL.md` under that path. Restart pi and the 31 Unity skills appear — ask for a task in natural language, or force one with `/skill:<name>`.

### 2. Extension (the Unity tools)

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
- **Tools** — the model can call:
  - `unity_project_info` — read editor version, manifest deps, asmdefs, scene/script counts.
  - `unity_detect_editors` — list installed Unity editors and their executables.
  - `unity_run_batch` — run Unity `-batchmode -quit` (e.g. `-executeMethod`, `-runTests`); asks you to confirm first.

## Example

```
> /unity:status
Unity 6000.3.24f1 · 1 scenes · 24 scripts
root: D:\games\MyGame
packages: 18 · asmdefs: 3
editors installed: 6000.3.24f1

> add rewarded ads so players can earn coins
(pi loads the levelplay-unity-integration skill and guides the integration)
```

## Notes & license

- `skills/` is adapted from [Unity-Technologies/unity-agent-plugin](https://github.com/Unity-Technologies/unity-agent-plugin), © Unity Technologies, under the **Unity Companion License** — see [LICENSE-Unity.md](LICENSE-Unity.md) and [ATTRIBUTION.md](ATTRIBUTION.md).
- The `extensions/` directory and pi tooling are **MIT** — see [LICENSE](LICENSE).
- This is an unofficial community packaging; it is not affiliated with or endorsed by Unity Technologies.
