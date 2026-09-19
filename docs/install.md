# Install & Troubleshooting

## Prerequisites

- [pi](https://github.com/earendil-works/pi-coding-agent) installed and working.
- Unity 6 (`6000.x`) installed via Unity Hub (for the extension's editor tools).
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
| `unity_detect_editors` returns none | Your editors are in a custom location. Edit `editorSearchRoots()` in `extensions/unity/index.ts` to add your Hub path. |
| `unity_run_batch` can't find the right editor | It prefers the version in `ProjectSettings/ProjectVersion.txt`; install that version via Unity Hub. |
| Windows symlink fails | Enable Developer Mode, or copy the folder instead of linking. |

## Updating

```bash
cd unity-pi-agent-plugin && git pull
# if you symlinked the extension, you're done.
# if you copied it, re-copy extensions/unity into ~/.pi/agent/extensions/
```
