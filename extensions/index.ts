/**
 * pi-onboard — Pi extension for repository onboarding.
 *
 * Registers the /onboard command which inspects a repo and generates durable
 * onboarding artifacts (AGENTS.md + HTML overview), plus an HTTP server so the
 * HTML is reachable from remote machines.
 *
 * Entry point: default-export factory receiving the Pi ExtensionAPI.
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getArgumentCompletions, parseArgs, USAGE } from "./flags.ts";
import { discover } from "./discovery.ts";
import { synthesize } from "./synthesis.ts";
import { generateAgentsMd, writeAgentsMd } from "./agents-md.ts";
import { generateHtml, writeHtml } from "./html.ts";
import { ensureServer, closeServer, type ServerInfo } from "./server.ts";
import { maybeInterview } from "./interview.ts";
import { DEFAULT_PREFERENCES, type Options, type Confidence, type Analysis } from "./types.ts";

export default function onboardExtension(pi: ExtensionAPI) {
  // Close any active server on session shutdown (cleanup insurance).
  pi.on("session_shutdown", () => {
    closeServer();
  });

  pi.registerCommand("onboard", {
    description: "Onboard into a repo: generate AGENTS.md and HTML overview",
    getArgumentCompletions,
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const result = parseArgs(args);

      if (result === null) {
        ctx.ui.notify(USAGE, "info");
        return;
      }

      const warnings = (result as Options & { warnings?: string[] }).warnings ?? [];
      for (const w of warnings) {
        ctx.ui.notify(w, "warning");
      }

      await runOnboard(result, ctx);
    },
  });
}

/**
 * Main orchestration per DESIGN.md "Expected MVP flow":
 * validate → discover → interview → synthesize → write AGENTS.md → write HTML → serve → summary.
 */
async function runOnboard(opts: Options, ctx: ExtensionCommandContext): Promise<void> {
  // 1. Discovery
  let repo;
  try {
    repo = discover(ctx.cwd);
  } catch (e) {
    ctx.ui.notify(`pi-onboard: discovery failed — ${e}`, "error");
    return;
  }

  // 2. Preference interview
  let prefs = DEFAULT_PREFERENCES;
  let interviewNote: string | undefined;
  try {
    const result = await maybeInterview(null, ctx, opts);
    prefs = result.prefs;
    interviewNote = result.note;
  } catch {
    interviewNote = "Preference interview failed — used defaults";
  }

  // 3. Synthesis (apply confidence floor from prefs)
  let analysis: Analysis;
  try {
    analysis = synthesize(repo);
    const floorRank: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
    analysis.commands = analysis.commands.filter(
      (c) => floorRank[c.confidence] >= floorRank[prefs.floor],
    );
  } catch (e) {
    ctx.ui.notify(`pi-onboard: synthesis failed — ${e}`, "error");
    return;
  }

  // 4. Generate content
  const agentsContent = generateAgentsMd(analysis, prefs);
  const htmlContent = !opts.textOnly ? generateHtml(analysis, prefs) : "";

  // 5. Dry-run: preview without writing
  if (opts.dryRun) {
    ctx.ui.notify("pi-onboard: dry-run preview (no files written)", "info");
    // eslint-disable-next-line no-console
    console.log("\n=== AGENTS.md preview ===\n" + agentsContent);
    if (!opts.textOnly) {
      // eslint-disable-next-line no-console
      console.log("=== HTML preview omitted (" + htmlContent.length + " chars) ===");
    }
    return;
  }

  // 6. Write AGENTS.md
  let agentsResult;
  try {
    agentsResult = writeAgentsMd(ctx.cwd, agentsContent, opts.force, false);
  } catch (e) {
    ctx.ui.notify(`pi-onboard: failed to write AGENTS.md — ${e}`, "error");
    return;
  }

  // 7. Write HTML (unless --text-only)
  let htmlResult: { path: string; action: string } | undefined;
  if (!opts.textOnly) {
    try {
      htmlResult = writeHtml(ctx.cwd, htmlContent, opts.force, false);
    } catch (e) {
      ctx.ui.notify(`pi-onboard: failed to write HTML — ${e}`, "error");
    }
  }

  // 8. Serve (unless --no-serve / --text-only)
  let serverInfo: ServerInfo | null = null;
  if (!opts.noServe && !opts.textOnly) {
    try {
      serverInfo = await ensureServer(ctx.cwd, opts);
    } catch (e) {
      ctx.ui.notify(`pi-onboard: failed to start server — ${e}`, "warning");
    }
  }

  // 9. Completion summary
  const summary = buildSummary(analysis, agentsResult, htmlResult, serverInfo, opts, interviewNote);
  ctx.ui.notify(summary, "info");
}

/**
 * Build the completion summary per DESIGN.md "Suggested Completion Summary".
 */
function buildSummary(
  analysis: Analysis,
  agentsResult: { path: string; action: string },
  htmlResult: { path: string; action: string } | undefined,
  serverInfo: ServerInfo | null,
  opts: Options,
  interviewNote: string | undefined,
): string {
  const lines: string[] = ["pi-onboard complete."];

  // Created files
  lines.push("Created:");
  lines.push(`- ${agentsResult.path} (${agentsResult.action})`);
  if (htmlResult) {
    lines.push(`- ${htmlResult.path} (${htmlResult.action})`);
  }

  // Serving block
  if (serverInfo) {
    const timeoutLabel = opts.idleTimeout === 0
      ? "(no auto-stop)"
      : `for ${opts.idleTimeout} min, then auto-stops`;
    const reuseLabel = serverInfo.reused ? " (reusing running server)" : "";
    lines.push("");
    lines.push(`Serving (${timeoutLabel}${reuseLabel}):`);
    for (const url of serverInfo.urls) {
      lines.push(`- ${url}`);
    }
    if (opts.host === "0.0.0.0") {
      lines.push("");
      lines.push("Note: bound to 0.0.0.0 — visible to other machines on this network.");
    }
  }

  // Confidence notes
  lines.push("");
  lines.push("Confidence notes:");
  if (analysis.stack.length > 0) {
    lines.push(`- detected stack: ${analysis.stack[0].confidence}`);
  }
  const testCmd = analysis.commands.find((c) => c.label === "Test");
  if (testCmd) {
    lines.push(`- detected test command: ${testCmd.confidence}`);
  }
  const lintCmd = analysis.commands.find((c) => c.label === "Lint");
  if (lintCmd) {
    lines.push(`- detected lint command: ${lintCmd.confidence}`);
  }
  if (analysis.purposeConfidence) {
    lines.push(`- detected purpose: ${analysis.purposeConfidence}`);
  }

  // Interview note
  if (interviewNote) {
    lines.push("");
    lines.push(`Note: ${interviewNote}`);
  }

  return lines.join("\n");
}
