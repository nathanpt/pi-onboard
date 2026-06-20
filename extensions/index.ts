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
import { generateAgentsMd, writeAgentsMd, type WriteResult } from "./agents-md.ts";
import { generateHtml, writeHtml } from "./html.ts";
import { ensureServer, closeServer } from "./server.ts";
import { maybeInterview } from "./interview.ts";
import { DEFAULT_PREFERENCES, type Options, type Confidence } from "./types.ts";

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

      await runOnboard(pi, result, ctx);
    },
  });
}

/**
 * Main orchestration. Phase 1 stub — wired to confirm the command loads.
 * Later phases implement the full DESIGN.md "Expected MVP flow".
 */
async function runOnboard(pi: ExtensionAPI, opts: Options, ctx: ExtensionCommandContext): Promise<void> {
  // 1. Discovery
  const repo = discover(ctx.cwd);

  // 2. Preference interview (before generation, after discovery)
  const { prefs, note: interviewNote } = await maybeInterview(pi, ctx, opts);

  // 3. Synthesis (apply confidence floor from prefs)
  const analysis = synthesize(repo);
  const floorRank: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
  analysis.commands = analysis.commands.filter(
    (c) => floorRank[c.confidence] >= floorRank[prefs.floor],
  );

  // 4. Generate AGENTS.md
  const content = generateAgentsMd(analysis, prefs);

  if (opts.dryRun) {
    // eslint-disable-next-line no-console
    console.log("[pi-onboard] AGENTS.md (dry-run):\n" + content);
    ctx.ui.notify("pi-onboard: dry-run preview printed to console", "info");
    return;
  }

  const result = writeAgentsMd(ctx.cwd, content, opts.force, opts.dryRun);
  // eslint-disable-next-line no-console
  console.log(`[pi-onboard] AGENTS.md ${result.action}: ${result.path}`);

  // HTML overview (unless --text-only)
  if (!opts.textOnly) {
    const htmlContent = generateHtml(analysis, prefs);
    const htmlResult = writeHtml(ctx.cwd, htmlContent, opts.force, opts.dryRun);
    // eslint-disable-next-line no-console
    console.log(`[pi-onboard] HTML ${htmlResult.action}: ${htmlResult.path}`);

    // Serve the HTML overview (unless --no-serve)
    if (!opts.noServe && !opts.dryRun) {
      const serverInfo = await ensureServer(ctx.cwd, opts);
      if (serverInfo) {
        // eslint-disable-next-line no-console
        console.log(`[pi-onboard] Serving ${serverInfo.reused ? "(reusing)" : "(started)"}:`);
        for (const url of serverInfo.urls) {
          // eslint-disable-next-line no-console
          console.log(`  ${url}`);
        }
      }
    }
  }

  ctx.ui.notify(`pi-onboard: ${result.action} ${result.path}`, "info");

  // Interview fallback note
  if (interviewNote) {
    // eslint-disable-next-line no-console
    console.log(`[pi-onboard] ${interviewNote}`);
  }
}
