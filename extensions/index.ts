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
import type { Options } from "./types.ts";

export default function onboardExtension(pi: ExtensionAPI) {
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
 * Main orchestration. Phase 1 stub — wired to confirm the command loads.
 * Later phases implement the full DESIGN.md "Expected MVP flow".
 */
async function runOnboard(opts: Options, ctx: ExtensionCommandContext): Promise<void> {
  // Phase 2: verify discovery
  const repo = discover(ctx.cwd);
  // eslint-disable-next-line no-console
  console.log("[pi-onboard] discovery:", JSON.stringify(repo, null, 2));
  ctx.ui.notify(`pi-onboard: discovered ${repo.name} — ${repo.topDirs.length} dirs, ${repo.languages.length} langs`, "info");
}
