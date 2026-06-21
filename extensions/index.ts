/**
 * pi-onboard — Pi extension for repository onboarding.
 *
 * The /onboard command does a quick static discovery pass, starts an HTTP
 * server for the HTML overview, then fills the editor with a structured
 * prompt. The user presses Enter and the agent reads key files and writes
 * AGENTS.md and pi-onboard-overview.html.
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getArgumentCompletions, parseArgs, USAGE } from "./flags.ts";
import { discover } from "./discovery.ts";
import { ensureServer, closeServer, type ServerInfo } from "./server.ts";
import type { Options, RepoContext } from "./types.ts";

// Load the prompt template once at module init.
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_TEMPLATE = readFileSync(join(__dirname, "prompt-template.md"), "utf-8");

export default function onboardExtension(pi: ExtensionAPI) {
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

async function runOnboard(opts: Options, ctx: ExtensionCommandContext): Promise<void> {
  // 1. Discovery with enriched context
  let repo: RepoContext;
  try {
    repo = discover(ctx.cwd);
  } catch (e) {
    ctx.ui.notify(`pi-onboard: discovery failed — ${e}`, "error");
    return;
  }

  // 2. Start server
  let serverInfo: ServerInfo | null = null;
  if (!opts.noServe && !opts.textOnly) {
    try {
      serverInfo = await ensureServer(ctx.cwd, opts);
    } catch (e) {
      ctx.ui.notify(`pi-onboard: failed to start server — ${e}`, "warning");
    }
  }

  // 3. Build the prompt from template
  const prompt = buildPrompt(repo, opts, serverInfo);

  // 4. Fill the editor
  ctx.ui.setEditorText(prompt);

  // 5. Notify
  const servingNote = serverInfo
    ? `\n\nServing at:\n${serverInfo.urls.map((u) => `  ${u}`).join("\n")}\n  (bound to 0.0.0.0 — visible to other machines on this network)`
    : "";
  ctx.ui.notify(
    `pi-onboard: press Enter to start the analysis.${servingNote}`,
    "info",
  );
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(
  repo: RepoContext,
  opts: Options,
  serverInfo: ServerInfo | null,
): string {
  // Build discovery JSON with enriched content
  const discoveryData = {
    name: repo.name,
    description: repo.description,
    readmeExcerpt: repo.readmeSummary?.slice(0, 500),
    runtime: repo.runtime,
    languages: repo.languages.slice(0, 5),
    scripts: repo.scripts,
    dependencies: repo.dependencies,
    devDependencies: repo.devDependencies,
    topDirs: repo.topDirs.map((d) => d.name),
    importantFiles: repo.importantFiles,
    hasExistingContext: repo.hasExistingContext,
  };

  // Safety strings
  const agentsSafety = opts.force
    ? " (overwrite if exists — --force is set)"
    : " (use draft filename if file already exists)";

  const fileSafety = opts.force
    ? "- **--force**: overwrite both files in place if they exist."
    : "- If `AGENTS.md` already exists → write `AGENTS.pi-onboard.draft.md` instead.\n- If `pi-onboard-overview.html` already exists → write `pi-onboard-overview.draft.html` instead.";

  const htmlStep = opts.textOnly
    ? ""
    : `4. Write \`pi-onboard-overview.html\` in the repo root${opts.force ? " (overwrite if exists)" : " (use draft filename if file already exists)"}.`;

  const htmlFormat = opts.textOnly
    ? "### Note: --text-only is set, skip HTML entirely.\n"
    : [
        "### HTML overview format",
        "Single self-contained `pi-onboard-overview.html`:",
        "- Dark theme, card-based, collapsible sections, embedded CSS, minimal inline JS",
        "- NO external dependencies or CDNs",
        "- Sections: summary card, repo structure, commands, conventions, where to start",
        ...(serverInfo
          ? ["", "The HTML is being served at:", ...serverInfo.urls.map((u) => `- ${u}`), "(server reads the file on each request, so output is live immediately)"]
          : []),
        "",
      ].join("\n");

  const textOnlyNote = opts.textOnly ? "### Note: --text-only is set, skip HTML entirely.\n" : "";

  // Fill the template
  return PROMPT_TEMPLATE
    .replace("{{{DISCOVERY_JSON}}}", JSON.stringify(discoveryData, null, 2))
    .replace("{{{AGENTS_SAFETY}}}", agentsSafety)
    .replace("{{{HTML_STEP}}}", htmlStep)
    .replace("{{{FILE_SAFETY}}}", fileSafety)
    .replace("{{{HTML_FORMAT}}}", htmlFormat)
    .replace("{{{TEXT_ONLY_NOTE}}}", textOnlyNote);
}
