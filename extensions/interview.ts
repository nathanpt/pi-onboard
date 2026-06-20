/**
 * Preference interview — adaptive user preferences via direct UI.
 *
 * When the session has UI (TUI/RPC), asks the user a short set of structured
 * preference questions using ctx.ui.select() before generating. When no UI is
 * available (print/json mode) or --yes is passed, returns defaults without
 * blocking.
 *
 * Design note: we use ctx.ui.select() directly rather than triggering an agent
 * turn via ask_user_question. A command handler cannot wait for a new agent
 * turn it triggers — the turn only starts after the handler returns. Direct UI
 * primitives are synchronous within the handler, which is exactly what we need.
 */
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_PREFERENCES, type Preferences, type Options } from "./types.ts";

/** How long to wait for user response before falling back (ms). */
const UI_TIMEOUT_MS = 60_000;

/**
 * Run the preference interview if possible, or return defaults.
 * Never blocks indefinitely — any failure falls back to defaults with a note.
 */
export async function maybeInterview(
  _pi: unknown,
  ctx: ExtensionCommandContext,
  opts: Options,
): Promise<{ prefs: Preferences; note?: string }> {
  const defaults: Preferences = { ...DEFAULT_PREFERENCES, html: !opts.textOnly };

  // --yes skips entirely
  if (opts.yes) {
    return { prefs: defaults };
  }

  // No UI available (print/json mode) — non-blocking defaults
  if (!ctx.hasUI) {
    return { prefs: defaults };
  }

  // Ask questions via direct UI primitives
  return askViaUi(ctx, opts, defaults);
}

// ---------------------------------------------------------------------------
// Direct UI interview (ctx.ui.select / ctx.ui.confirm)
// ---------------------------------------------------------------------------

async function askViaUi(
  ctx: ExtensionCommandContext,
  opts: Options,
  defaults: Preferences,
): Promise<{ prefs: Preferences; note?: string }> {
  let prefs = { ...defaults };
  const notes: string[] = [];

  try {
    // Q1: Detail level (the anchor question)
    const detail = await ctx.ui.select(
      "AGENTS.md detail level",
      ["Concise", "Balanced", "Detailed"],
      { timeout: UI_TIMEOUT_MS },
    );

    if (detail === undefined) {
      return { prefs: defaults, note: "Interview dismissed — used defaults" };
    }

    const detailMap: Record<string, Preferences["detail"]> = {
      Concise: "concise",
      Balanced: "balanced",
      Detailed: "detailed",
    };
    prefs.detail = detailMap[detail] ?? "balanced";

    // Q2: Confidence floor
    const floor = await ctx.ui.select(
      "Minimum confidence for commands",
      ["High only", "Include medium", "Include low"],
      { timeout: UI_TIMEOUT_MS },
    );

    if (floor !== undefined) {
      const floorMap: Record<string, Preferences["floor"]> = {
        "High only": "high",
        "Include medium": "medium",
        "Include low": "low",
      };
      prefs.floor = floorMap[floor] ?? "medium";
    }

    // Q3: Emit HTML overview? (skip if --text-only already set)
    if (!opts.textOnly) {
      const emitHtml = await ctx.ui.confirm(
        "Generate HTML overview?",
        "An interactive HTML file will be created and served over HTTP.",
        { timeout: UI_TIMEOUT_MS },
      );
      prefs.html = emitHtml;
    }

    // Q4: Which sections? (simple — offer "All" or "Standard set")
    // For MVP we keep the default sections; a multi-select would need custom UI.
    // The detail level already controls verbosity.

    return { prefs, note: notes.length > 0 ? notes.join("; ") : undefined };
  } catch {
    return { prefs: defaults, note: "Interview failed — used defaults" };
  }
}
