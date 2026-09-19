/**
 * unity-pi-agent-plugin — pi extension (Unity CLI bridge)
 *
 * Thin wrapper over the official `unity` CLI so pi gets the SAME capability
 * source as the official Claude/Codex plugin: live-editor control via
 * `unity command` / `unity command eval`, plus project lifecycle commands.
 *
 * Tools (all drive the real `unity` binary; nothing is re-implemented):
 *   unity_status    -> `unity status --json`          (live Editor instances)
 *   unity_command   -> `unity command <name> [args]`  (run an Editor command)
 *   unity_eval      -> `unity command eval <csharp>`  (eval C# in a live Editor)
 *   unity_build     -> `unity build <project> ...`    (headless build)
 *   unity_test      -> `unity test <project> ...`     (EditMode/PlayMode)
 *
 * Commands:
 *   /unity:status   -> TUI widget + notify summary
 *
 * Fallback: when the `unity` CLI is not installed, read-only static inspection
 * still works via file parsing (ProjectVersion / manifest.json / asmdef).
 */

import { Type } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFile, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// unity CLI invocation
// ---------------------------------------------------------------------------

const GLOBAL_JSON = ["--format", "json", "--no-banner", "--non-interactive"] as const;

interface UnityEnvelope {
	success?: boolean;
	command?: string;
	data?: unknown;
	errors?: Array<{ code?: string; message?: string }>;
	warnings?: Array<{ code?: string; message?: string }> | unknown;
	[key: string]: unknown;
}

interface RunResult {
	ok: boolean;
	envelope?: UnityEnvelope;
	stdout: string;
	stderr: string;
	exitCode: number | null;
	timedOut?: boolean;
	notFound?: boolean;
}

/** Locate the `unity` binary on PATH (or a couple of well-known spots). */
function findUnityBinary(): string | null {
	const fromPath = (() => {
		const cmd = process.platform === "win32" ? "where" : "which";
		try {
			const out = execFileSync(cmd, ["unity"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
			const first = out.split(/\r?\n/).find((l) => l.trim());
			if (first) return first.trim();
		} catch {
			/* not on PATH */
		}
		return null;
	})();
	if (fromPath) return fromPath;

	const home = os.homedir();
	const candidates =
		process.platform === "win32"
			? [path.join(home, "AppData/Local/Unity/bin/unity.exe"), path.join(home, "AppData/Local/Unity/bin/unity")]
			: process.platform === "darwin"
				? ["/usr/local/bin/unity", "/opt/homebrew/bin/unity", path.join(home, ".local/bin/unity")]
				: [path.join(home, ".local/bin/unity"), "/usr/local/bin/unity"];
	for (const c of candidates) if (fs.existsSync(c)) return c;
	return null;
}

/** Run `unity <args>` with the JSON envelope flags; capture, don't throw. */
function runUnity(args: string[], opts: { timeoutMs?: number; cwd?: string } = {}): Promise<RunResult> {
	const bin = findUnityBinary();
	if (!bin) {
		return Promise.resolve({
			ok: false,
			notFound: true,
			stdout: "",
			stderr: "unity CLI not found on PATH",
			exitCode: null,
		});
	}
	const timeoutMs = opts.timeoutMs ?? 60_000;
	const finalArgs = [...args, ...GLOBAL_JSON];
	return new Promise((resolve) => {
		execFile(
			bin,
			finalArgs,
			{ timeout: timeoutMs, cwd: opts.cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
			(err, stdout, stderr) => {
				const out = String(stdout ?? "");
				const errOut = String(stderr ?? "");
				let envelope: UnityEnvelope | undefined;
				const trimmed = out.trim();
				const jsonStart = trimmed.indexOf("{");
				if (jsonStart >= 0) {
					try {
						envelope = JSON.parse(trimmed.slice(jsonStart)) as UnityEnvelope;
					} catch {
						envelope = undefined;
					}
				}
				const timedOut = !!err && (err as NodeJS.ErrnoException).killed === true;
				resolve({
					ok: !err,
					envelope,
					stdout: out,
					stderr: errOut,
					exitCode: (err as NodeJS.ErrnoException | null)?.code ?? 0,
					timedOut,
				});
			}
		);
	});
}

/** Format a RunResult into a readable text block for the model. */
function formatResult(res: RunResult, humanLabel: string): string {
	if (res.notFound) {
		return [
			"unity CLI not found on PATH.",
			"Install it (beta):",
			"  macOS/Linux:  curl -fsSL https://public-cdn.cloud.unity3d.com/hub/prod/cli/install.sh | UNITY_CLI_CHANNEL=beta bash",
			"  Windows:      $env:UNITY_CLI_CHANNEL='beta'; irm https://public-cdn.cloud.unity3d.com/hub/prod/cli/install.ps1 | iex",
		].join("\n");
	}
	const parts: string[] = [];
	if (res.envelope && typeof res.envelope === "object") {
		const env = res.envelope;
		if (env.success === false) {
			const errs = Array.isArray(env.errors)
				? env.errors.map((e) => e?.message ?? String(e)).join("\n")
				: "";
			parts.push(`${humanLabel} failed:`, errs || JSON.stringify(env.data ?? env));
		} else {
			parts.push(JSON.stringify(env.data ?? env, null, 2));
		}
	} else {
		// No JSON envelope — dump raw output (truncated)
		parts.push(`${humanLabel} output:`, res.stdout.slice(-4000) || "(no output)");
		if (res.stderr.trim()) parts.push("stderr:", res.stderr.slice(-2000));
	}
	if (res.timedOut) parts.push("\n(timed out)");
	if (res.exitCode && res.exitCode !== 0 && !res.envelope)
		parts.push(`\nexit code: ${res.exitCode}`);
	return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Static fallback: read project info without the CLI (used when unity absent
// or as a complement to `unity status`).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Extension entry
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	// ---- unity_status -------------------------------------------------------
	pi.registerTool({
		name: "unity_status",
		label: "Unity Status",
		description:
			"Show live state of connected Unity Editor instances (port, project, version, PID, ready state). Wraps `unity status --json`.",
		parameters: Type.Object({
			projectPath: Type.Optional(
				Type.String({ description: "Filter to an Editor whose project path contains this substring" })
			),
		}),
		async execute(_id, params) {
			const args = ["status"];
			if (params.projectPath) args.push("--project-path", params.projectPath);
			const res = await runUnity(args);
			return { content: [{ type: "text", text: formatResult(res, "unity status") }], details: { result: res } };
		},
	});

	// ---- unity_command ------------------------------------------------------
	pi.registerTool({
		name: "unity_command",
		label: "Unity Command",
		description:
			"Execute a Pipeline command on a connected Unity Editor (`unity command <name> [args]`). Use to create/modify GameObjects, edit scenes/assets, enter Play mode, etc. Omit name to list available commands.",
		parameters: Type.Object({
			command: Type.Optional(
				Type.String({ description: "Editor command name (omit to list available commands)" })
			),
			args: Type.Optional(
				Type.Array(Type.String(), { description: "Arguments for the command" })
			),
			projectPath: Type.Optional(
				Type.String({ description: "Target Editor's project path (disambiguates multiple open Editors)" })
			),
		}),
		async execute(_id, params) {
			const args = ["command"];
			if (params.command) args.push(params.command);
			if (params.args?.length) args.push(...params.args);
			if (params.projectPath) args.push("--project-path", params.projectPath);
			args.push("--caller", "pi", "--skill", "unity-pi");
			const res = await runUnity(args);
			return { content: [{ type: "text", text: formatResult(res, "unity command") }], details: { result: res } };
		},
	});

	// ---- unity_eval ---------------------------------------------------------
	pi.registerTool({
		name: "unity_eval",
		label: "Unity Eval (live C#)",
		description:
			"Evaluate arbitrary C# in a connected live Unity Editor via `unity command eval`. Requires the project's com.unity.pipeline package and a running Editor. Asks the user to confirm before running.",
		parameters: Type.Object({
			code: Type.String({ description: "C# expression/statement to run in the Editor (e.g. 'return Application.unityVersion;')" }),
			projectPath: Type.Optional(
				Type.String({ description: "Target Editor's project path" })
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const preview = params.code.length > 300 ? params.code.slice(0, 300) + "…" : params.code;
			const ok = await ctx.ui.confirm(
				"Run C# in live Unity Editor?",
				`unity command eval "${preview}"${params.projectPath ? `\nproject: ${params.projectPath}` : ""}`
			);
			if (!ok) return { content: [{ type: "text", text: "Cancelled by user." }], details: { cancelled: true } };
			const args = ["command", "eval", params.code];
			if (params.projectPath) args.push("--project-path", params.projectPath);
			// analytics label, same convention as the official plugin
			args.push("--caller", "pi", "--skill", "unity-pi");
			const res = await runUnity(args);
			return { content: [{ type: "text", text: formatResult(res, "unity eval") }], details: { result: res } };
		},
	});

	// ---- unity_run ----------------------------------------------------------
	pi.registerTool({
		name: "unity_run",
		label: "Unity Run (batch)",
		description:
			"Run a Unity project in batch mode via `unity run`. Two modes: (a) --command <name> executes a registered Pipeline command headlessly (fresh editor boot, prints result, exits; reuses a running editor if open), (b) editorArgs forwards raw args to the Unity executable (e.g. -executeMethod). Asks for confirmation before launching.",
		parameters: Type.Object({
			project: Type.String({ description: "Project path or name" }),
			command: Type.Optional(
				Type.String({ description: "Registered Pipeline command name to run headlessly" })
			),
			commandArgs: Type.Optional(
				Type.Array(Type.String(), { description: "Args after -- parsed against the command's schema" })
			),
			editorArgs: Type.Optional(
				Type.Array(Type.String(), { description: "Raw args forwarded to the Unity executable after -- (e.g. ['-executeMethod','Builder.Build'])" })
			),
			timeoutSec: Type.Optional(Type.Number({ description: "Kill editor after N seconds" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const args = ["run", params.project];
			if (params.command) args.push("--command", params.command);
			if (params.timeoutSec) args.push("--timeout", String(params.timeoutSec));
			const tail = params.command ? params.commandArgs : params.editorArgs;
			if (tail?.length) args.push("--", ...tail);
			const ok = await ctx.ui.confirm("Run Unity project (batch)?", `unity ${args.join(" ")}`);
			if (!ok) return { content: [{ type: "text", text: "Cancelled by user." }], details: { cancelled: true } };
			const res = await runUnity(args, { timeoutMs: ((params.timeoutSec ?? 1200) + 30) * 1000 });
			return { content: [{ type: "text", text: formatResult(res, "unity run") }], details: { result: res } };
		},
	});

	// ---- unity_build --------------------------------------------------------
	pi.registerTool({
		name: "unity_build",
		label: "Unity Build",
		description:
			"Build a Unity project headlessly via `unity build`. Supports --target (StandaloneWindows64/Android/iOS/WebGL), --profile, or a custom --execute-method. Asks for confirmation before launching.",
		parameters: Type.Object({
			project: Type.String({ description: "Project path or name" }),
			target: Type.Optional(Type.String({ description: "Build target, e.g. StandaloneWindows64, Android, iOS, WebGL" })),
			profile: Type.Optional(Type.String({ description: "Build profile name/path (Unity 6+)" })),
			executeMethod: Type.Optional(Type.String({ description: "Static C# method to drive the build (e.g. Builder.PerformBuild)" })),
			extraArgs: Type.Optional(Type.Array(Type.String(), { description: "Additional raw build args" })),
			timeoutSec: Type.Optional(Type.Number({ description: "Timeout in seconds (default 1200)" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const args = ["build", params.project];
			if (params.target) args.push("--target", params.target);
			if (params.profile) args.push("--profile", params.profile);
			if (params.executeMethod) args.push("--execute-method", params.executeMethod);
			if (params.extraArgs?.length) args.push(...params.extraArgs);
			const ok = await ctx.ui.confirm("Run Unity build?", `unity ${args.join(" ")}`);
			if (!ok) return { content: [{ type: "text", text: "Cancelled by user." }], details: { cancelled: true } };
			const res = await runUnity(args, { timeoutMs: (params.timeoutSec ?? 1200) * 1000 });
			return { content: [{ type: "text", text: formatResult(res, "unity build") }], details: { result: res } };
		},
	});

	// ---- unity_test ---------------------------------------------------------
	pi.registerTool({
		name: "unity_test",
		label: "Unity Test",
		description:
			"Run a project's EditMode/PlayMode tests via `unity test` and write a results report (NUnit/JUnit XML). Asks for confirmation before launching.",
		parameters: Type.Object({
			project: Type.String({ description: "Project path or name" }),
			mode: Type.Optional(Type.String({ description: "EditMode or PlayMode" })),
			filter: Type.Optional(Type.String({ description: "Run only tests matching this name pattern" })),
			output: Type.Optional(Type.String({ description: "Report output path (default test-results.xml)" })),
			extraArgs: Type.Optional(Type.Array(Type.String(), { description: "Additional raw test args" })),
			timeoutSec: Type.Optional(Type.Number({ description: "Timeout in seconds (default 1200)" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const args = ["test", params.project];
			if (params.mode) args.push("--mode", params.mode);
			if (params.filter) args.push("--filter", params.filter);
			if (params.output) args.push("--output", params.output);
			if (params.extraArgs?.length) args.push(...params.extraArgs);
			const ok = await ctx.ui.confirm("Run Unity tests?", `unity ${args.join(" ")}`);
			if (!ok) return { content: [{ type: "text", text: "Cancelled by user." }], details: { cancelled: true } };
			const res = await runUnity(args, { timeoutMs: (params.timeoutSec ?? 1200) * 1000 });
			return { content: [{ type: "text", text: formatResult(res, "unity test") }], details: { result: res } };
		},
	});

	// ---- /unity:status ------------------------------------------------------
	pi.registerCommand("unity:status", {
		description: "Show live Unity Editor instances + detected project. /unity:status [path]",
		handler: async (args, ctx) => {
			const dir = args?.trim() || ctx.cwd;
			const status = await runUnity(["status"]);
			const root = findProjectRoot(dir);
			const version = root ? readEditorVersion(root) : null;

			const lines: string[] = [];
			lines.push(`CLI: ${findUnityBinary() ? "unity found" : "unity NOT found"}`);
			if (root) lines.push(`project: ${root} (Unity ${version ?? "?"})`);
			else lines.push(`project: none detected at ${dir}`);

			if (status.notFound) {
				lines.push("Install: curl -fsSL https://public-cdn.cloud.unity3d.com/hub/prod/cli/install.sh | UNITY_CLI_CHANNEL=beta bash");
			} else if (status.envelope?.success && status.envelope.data) {
				const data = status.envelope.data as { instances?: Array<{ project?: string; version?: string; port?: number; state?: string }>; count?: number };
				const inst = data.instances ?? [];
				if (inst.length === 0) lines.push("live editors: none running");
				for (const i of inst)
					lines.push(`live editor: ${i.project ?? "?"} v${i.version ?? "?"} :${i.port ?? "?"} [${i.state ?? "?"}]`);
			} else {
				const msg = status.envelope?.errors?.[0]?.message ?? "no instances";
				lines.push(`live editors: ${msg}`);
			}
			ctx.ui.setWidget("unity", lines);
			ctx.ui.notify(root ? `Unity ${version ?? "?"} project detected` : "No Unity project here", "info");
		},
	});

	// ---- startup status -----------------------------------------------------
	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		const root = findProjectRoot(ctx.cwd);
		if (root) {
			const v = readEditorVersion(root);
			ctx.ui.setStatus("unity", `Unity ${v ?? "?"} ${findUnityBinary() ? "" : "(no CLI)"}`);
		}
	});
}
