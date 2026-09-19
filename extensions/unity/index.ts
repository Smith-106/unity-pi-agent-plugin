/**
 * unity-pi-agent-plugin — pi extension
 *
 * Adds Unity-aware tools and a /unity:status command to pi.
 *
 * Tools:
 *  - unity_detect_editors  : scan for installed Unity editors
 *  - unity_project_info    : read ProjectVersion, manifest deps, asmdefs, scene/script counts
 *  - unity_run_batch       : run Unity in -batchmode (confirm-gated)
 *
 * Install: link this directory into ~/.pi/agent/extensions/unity/
 */

import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Unity discovery helpers
// ---------------------------------------------------------------------------

interface EditorInfo {
	version: string;
	executable: string;
}

/** Platform-specific roots that may contain per-version Unity editors. */
function editorSearchRoots(): string[] {
	const home = os.homedir();
	switch (process.platform) {
		case "win32":
			return [
				"C:/Program Files/Unity/Hub/Editor",
				"C:/Program Files/Unity/Editor",
				path.join(home, "AppData/Local/Unity/Editor"),
			];
		case "darwin":
			return ["/Applications/Unity/Hub/Editor", "/Applications/Unity"];
		default:
			return [
				path.join(home, "Unity/Hub/Editor"),
				path.join(home, ".local/share/unity3d"),
				"/opt/unity",
			];
	}
}

/** Given a version install dir, return the Unity executable path or null. */
function editorExecutable(dir: string): string | null {
	const candidates =
		process.platform === "win32"
			? [path.join(dir, "Editor", "Unity.exe"), path.join(dir, "Unity.exe")]
			: process.platform === "darwin"
				? [
						path.join(dir, "Unity.app", "Contents", "MacOS", "Unity"),
						path.join(dir, "Unity"),
					]
				: [path.join(dir, "Editor", "Unity"), path.join(dir, "Unity")];
	for (const c of candidates) {
		if (fs.existsSync(c)) return c;
	}
	return null;
}

/** Scan search roots and return installed Unity editors. */
function detectEditors(): EditorInfo[] {
	const found: EditorInfo[] = [];
	for (const root of editorSearchRoots()) {
		if (!fs.existsSync(root)) continue;
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(root, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const e of entries) {
			const dir = path.join(root, e.name);
			const exe = editorExecutable(dir);
			if (exe) found.push({ version: e.name, executable: exe });
		}
		// also handle the case where root itself is a single install
		const selfExe = editorExecutable(root);
		if (selfExe && !found.some((f) => f.executable === selfExe)) {
			found.push({ version: path.basename(root), executable: selfExe });
		}
	}
	// de-dupe by executable
	const seen = new Set<string>();
	return found.filter((f) => !seen.has(f.executable) && seen.add(f.executable));
}

// ---------------------------------------------------------------------------
// Unity project helpers
// ---------------------------------------------------------------------------

interface ProjectInfo {
	root: string;
	editorVersion: string | null;
	packages: Record<string, string>;
	asmdefs: string[];
	sceneCount: number;
	scriptCount: number;
}

/** Walk upward from dir looking for ProjectSettings/ProjectVersion.txt. */
function findProjectRoot(startDir: string): string | null {
	let dir = path.resolve(startDir);
	for (let i = 0; i < 12; i++) {
		if (fs.existsSync(path.join(dir, "ProjectSettings", "ProjectVersion.txt"))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

function readEditorVersion(root: string): string | null {
	try {
		const txt = fs.readFileSync(path.join(root, "ProjectSettings", "ProjectVersion.txt"), "utf8");
		const m = txt.match(/m_EditorVersion:\s*(\S+)/);
		return m ? m[1] : null;
	} catch {
		return null;
	}
}

function readManifest(root: string): Record<string, string> {
	try {
		const raw = fs.readFileSync(path.join(root, "Packages", "manifest.json"), "utf8");
		const json = JSON.parse(raw);
		return (json.dependencies as Record<string, string>) ?? {};
	} catch {
		return {};
	}
}

/** Recursively collect files matching a predicate under dir, bounded. */
function collect(dir: string, match: (name: string) => boolean, max = 4000): string[] {
	const out: string[] = [];
	const stack = [dir];
	while (stack.length && out.length < max) {
		const cur = stack.pop()!;
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(cur, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const e of entries) {
			if (out.length >= max) break;
			const full = path.join(cur, e.name);
			if (e.isDirectory()) {
				if (e.name === "Library" || e.name === "obj" || e.name === "Temp" || e.name === "Logs" || e.name === "node_modules") continue;
				stack.push(full);
			} else if (match(e.name)) {
				out.push(full);
			}
		}
	}
	return out;
}

function gatherProjectInfo(dir: string): ProjectInfo | { error: string } {
	const root = findProjectRoot(dir);
	if (!root) return { error: `No Unity project found at or above: ${dir}` };
	const assetsDir = path.join(root, "Assets");
	const asmdefs = fs.existsSync(assetsDir)
		? collect(assetsDir, (n) => n.endsWith(".asmdef")).map((p) => path.relative(root, p))
		: [];
	const scenes = fs.existsSync(assetsDir) ? collect(assetsDir, (n) => n.endsWith(".unity")).length : 0;
	const scripts = fs.existsSync(assetsDir) ? collect(assetsDir, (n) => n.endsWith(".cs")).length : 0;
	return {
		root,
		editorVersion: readEditorVersion(root),
		packages: readManifest(root),
		asmdefs,
		sceneCount: scenes,
		scriptCount: scripts,
	};
}

// ---------------------------------------------------------------------------
// Extension entry
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	// ---- Tool: detect installed Unity editors --------------------------------
	pi.registerTool({
		name: "unity_detect_editors",
		label: "Detect Unity Editors",
		description:
			"Scan common install locations for Unity editors and return their versions and executable paths.",
		parameters: Type.Object({}),
		async execute() {
			const editors = detectEditors();
			const text = editors.length
				? editors.map((e) => `${e.version}  ${e.executable}`).join("\n")
				: "No Unity editors found in the standard install locations.";
			return { content: [{ type: "text", text }], details: { editors } };
		},
	});

	// ---- Tool: project info --------------------------------------------------
	pi.registerTool({
		name: "unity_project_info",
		label: "Unity Project Info",
		description:
			"Inspect a Unity project: editor version, manifest dependencies, asmdef files, and scene/script counts. Walks up from path to find the project root.",
		parameters: Type.Object({
			path: Type.Optional(Type.String({ description: "Directory to search from (default: cwd)" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const base = params.path ?? ctx.cwd;
			const info = gatherProjectInfo(base);
			if ("error" in info) {
				return { content: [{ type: "text", text: info.error }], details: {} };
			}
			const pkgLines = Object.entries(info.packages)
				.map(([k, v]) => `  ${k}: ${v}`)
				.join("\n");
			const text = [
				`Project root : ${info.root}`,
				`Unity version: ${info.editorVersion ?? "unknown"}`,
				`Scenes       : ${info.sceneCount}`,
				`Scripts (.cs): ${info.scriptCount}`,
				`asmdefs      : ${info.asmdefs.length}`,
				info.asmdefs.length ? info.asmdefs.map((a) => `  ${a}`).join("\n") : "",
				`Packages (${Object.keys(info.packages).length}):`,
				pkgLines || "  (none)",
			]
				.filter(Boolean)
				.join("\n");
			return { content: [{ type: "text", text }], details: { project: info } };
		},
	});

	// ---- Tool: run Unity batchmode ------------------------------------------
	pi.registerTool({
		name: "unity_run_batch",
		label: "Run Unity Batchmode",
		description:
			"Run Unity in -batchmode -quit against a project. Use for build scripts, EditMode test runs, or -executeMethod entry points. Asks the user to confirm before launching.",
		parameters: Type.Object({
			projectPath: Type.String({ description: "Path to the Unity project root" }),
			args: Type.Array(Type.String(), {
				description:
					"Extra Unity CLI args, e.g. ['-executeMethod','My.Build.Run'] or ['-runTests','-testPlatform','EditMode']",
			}),
			logFile: Type.Optional(
				Type.String({ description: "Editor log output path (default: <project>/pi-batch.log)" })
			),
			timeoutSec: Type.Optional(
				Type.Number({ description: "Timeout in seconds (default 600)" })
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const projectPath = path.resolve(params.projectPath);
			if (!fs.existsSync(path.join(projectPath, "ProjectSettings", "ProjectVersion.txt"))) {
				return {
					content: [{ type: "text", text: `Not a Unity project root: ${projectPath}` }],
					details: {},
				};
			}

			// resolve editor executable: prefer project version, else first detected
			const version = readEditorVersion(projectPath);
			const editors = detectEditors();
			const editor =
				(version && editors.find((e) => e.version === version)) || editors[0];
			if (!editor) {
				return {
					content: [{ type: "text", text: "No Unity editor executable found." }],
					details: {},
				};
			}

			const logFile = params.logFile ?? path.join(projectPath, "pi-batch.log");
			const timeoutMs = (params.timeoutSec ?? 600) * 1000;

			const cmdLine = `"${editor.executable}" -batchmode -quit -projectPath "${projectPath}" -logFile "${logFile}" ${params.args.join(" ")}`;
			const ok = await ctx.ui.confirm(
				"Run Unity batchmode?",
				`${cmdLine}\n\nThis launches the Unity editor headless. Continue?`
			);
			if (!ok) {
				return { content: [{ type: "text", text: "Cancelled by user." }], details: { cancelled: true } };
			}

			try {
				const out = execFileSync(
					editor.executable,
					["-batchmode", "-quit", "-projectPath", projectPath, "-logFile", logFile, ...params.args],
					{ timeout: timeoutMs, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
				);
				return {
					content: [
						{
							type: "text",
							text: `Unity batchmode finished (editor ${editor.version}).\nLog: ${logFile}\n\n${out.slice(-2000)}`,
						},
					],
					details: { logFile, editor: editor.version, args: params.args },
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [
						{
							type: "text",
							text: `Unity batchmode failed or timed out.\n${msg}\n\nCheck log: ${logFile}`,
						},
					],
					details: { logFile, error: msg },
				};
			}
		},
	});

	// ---- Command: /unity:status ----------------------------------------------
	pi.registerCommand("unity:status", {
		description: "Show detected Unity project and installed editors: /unity:status [path]",
		handler: async (args, ctx) => {
			const info = gatherProjectInfo(args?.trim() || ctx.cwd);
			const editors = detectEditors();
			if ("error" in info) {
				ctx.ui.notify(`${info.error}\nEditors found: ${editors.length}`, "warning");
				return;
			}
			const lines = [
				`Unity ${info.editorVersion ?? "?"} · ${info.sceneCount} scenes · ${info.scriptCount} scripts`,
				`root: ${info.root}`,
				`packages: ${Object.keys(info.packages).length} · asmdefs: ${info.asmdefs.length}`,
				`editors installed: ${editors.map((e) => e.version).join(", ") || "none"}`,
			];
			ctx.ui.setWidget("unity", lines);
			ctx.ui.notify(`Unity project: ${info.editorVersion ?? "unknown"} @ ${info.root}`, "info");
		},
	});

	// ---- Startup nudge --------------------------------------------------------
	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		const info = gatherProjectInfo(ctx.cwd);
		if (!("error" in info)) {
			ctx.ui.setStatus("unity", `Unity ${info.editorVersion ?? "?"}`);
		}
	});
}
