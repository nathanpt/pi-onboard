/**
 * Preference interview — adaptive user preferences via ask_user_question.
 *
 * Detects whether an ask_user_question-style tool is available. If so, triggers
 * an agent turn that asks the user a short set of preference questions and
 * emits a structured marker. If absent or --yes, returns defaults.
 *
 * The interview is a UX concern only — discovery and generation stay static.
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_PREFERENCES, type Preferences, type Options } from "./types.ts";

/** Marker the agent emits carrying resolved preferences. */
const PREFS_MARKER = /<!--\s*pi-onboard:prefs\s*(\{.*?\})\s*-->/;

/** How long to wait for the interview turn before giving up (ms). */
const INTERVIEW_TIMEOUT_MS = 120_000;

/**
 * Run the preference interview if possible, or return defaults.
 * Never blocks — any failure falls back to defaults with a note.
 */
export async function maybeInterview(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  opts: Options,
): Promise<{ prefs: Preferences; note?: string }> {
  // --yes skips entirely
  if (opts.yes) {
    return { prefs: { ...DEFAULT_PREFERENCES, html: !opts.textOnly } };
  }

  // Detect ask_user_question-style tool
  const activeTools = pi.getActiveTools();
  const hasAskTool = activeTools.includes("ask_user_question");

  if (!hasAskTool) {
    // Fallback: ask minimal subset via ctx.ui if available
    if (ctx.hasUI) {
      return askMinimalUi(ctx, opts);
    }
    return { prefs: { ...DEFAULT_PREFERENCES, html: !opts.textOnly } };
  }

  // Tool available: trigger agent interview via marker handoff
  return askViaAgent(pi, ctx, opts);
}

// ---------------------------------------------------------------------------
// Agent-based interview (ask_user_question + marker handoff)
// ---------------------------------------------------------------------------

async function askViaAgent(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  opts: Options,
): Promise<{ prefs: Preferences; note?: string }> {
  let capturedText = "";
  let toolReturned = false;

  // Scoped listeners
  const onMessageEnd = (event: { message: { role?: string; content?: Array<{ type: string; text?: string }> } }) => {
    if (event.message?.role === "assistant") {
      const text = (event.message.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("\n");
      capturedText += text + "\n";
    }
  };

  const onToolResult = (event: { toolName: string }) => {
    if (event.toolName === "ask_user_question") {
      toolReturned = true;
    }
  };

  pi.on("message_end", onMessageEnd);
  pi.on("tool_result", onToolResult);

  try {
    // Trigger the interview
    pi.sendUserMessage(
      `Run the /onboard preference interview. Ask the user these questions using ask_user_question:

1. Detail level: "Concise", "Balanced", "Detailed"
2. Command confidence floor: "High only", "Include Medium", "Include Low"
3. Which sections to include (multiSelect): "Important paths", "Commands", "Conventions", "Where to start", "Open uncertainties"
4. Emit HTML overview?: "Yes", "No"

After the user answers, emit EXACTLY one line with their choices as JSON, then stop. Do NOT generate AGENTS.md or any files. The line format must be exactly:
<!-- pi-onboard:prefs {"detail":"concise|balanced|detailed","floor":"high|medium|low","html":true|false,"sections":["paths","commands","conventions","where-to-start","uncertainties"]} -->

Map section labels to ids: "Important paths"→"paths", "Commands"→"commands", "Conventions"→"conventions", "Where to start"→"where-to-start", "Open uncertainties"→"uncertainties".`,
    );

    // Wait for the agent to finish (with timeout)
    await Promise.race([
      ctx.waitForIdle(),
      new Promise<void>((resolve) => setTimeout(resolve, INTERVIEW_TIMEOUT_MS)),
    ]);

    // Scan captured text for the marker
    const match = capturedText.match(PREFS_MARKER);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        const prefs = validatePrefs(parsed, opts);
        return { prefs };
      } catch {
        // Malformed JSON in marker
        if (toolReturned) {
          return {
            prefs: { ...DEFAULT_PREFERENCES, html: !opts.textOnly },
            note: "Interview completed but marker was malformed — used defaults",
          };
        }
      }
    }

    // Tool returned but no marker — fallback
    if (toolReturned) {
      return {
        prefs: { ...DEFAULT_PREFERENCES, html: !opts.textOnly },
        note: "Interview completed but preferences were not captured — used defaults",
      };
    }

    // No tool call at all — user may have dismissed or agent didn't ask
    return {
      prefs: { ...DEFAULT_PREFERENCES, html: !opts.textOnly },
      note: "Preference interview was not completed — used defaults",
    };
  } catch {
    return {
      prefs: { ...DEFAULT_PREFERENCES, html: !opts.textOnly },
      note: "Preference interview failed — used defaults",
    };
  } finally {
    // Clean up listeners
    pi.off?.("message_end", onMessageEnd);
    pi.off?.("tool_result", onToolResult);
  }
}

// ---------------------------------------------------------------------------
// Minimal UI fallback (ctx.ui.select)
// ---------------------------------------------------------------------------

async function askMinimalUi(
  ctx: ExtensionCommandContext,
  opts: Options,
): Promise<{ prefs: Preferences; note?: string }> {
  const defaults = { ...DEFAULT_PREFERENCES, html: !opts.textOnly };

  try {
    const detail = await ctx.ui.select(
      "AGENTS.md detail level",
      ["Concise", "Balanced", "Detailed"],
      { timeout: 30_000 },
    );

    if (!detail) return { prefs: defaults, note: "Interview dismissed — used defaults" };

    const detailMap: Record<string, Preferences["detail"]> = {
      Concise: "concise",
      Balanced: "balanced",
      Detailed: "detailed",
    };

    return {
      prefs: {
        ...defaults,
        detail: detailMap[detail] ?? "balanced",
      },
    };
  } catch {
    return { prefs: defaults };
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validatePrefs(parsed: unknown, opts: Options): Preferences {
  const p = parsed as Record<string, unknown>;
  const validDetails = ["concise", "balanced", "detailed"];
  const validFloors = ["high", "medium", "low"];
  const validSections = ["purpose", "stack", "paths", "commands", "conventions", "where-to-start", "uncertainties"];

  return {
    detail: validDetails.includes(p.detail as string) ? (p.detail as Preferences["detail"]) : "balanced",
    floor: validFloors.includes(p.floor as string) ? (p.floor as Preferences["floor"]) : "medium",
    html: typeof p.html === "boolean" ? p.html : !opts.textOnly,
    sections: Array.isArray(p.sections)
      ? (p.sections as string[]).filter((s) => validSections.includes(s))
      : DEFAULT_PREFERENCES.sections,
  };
}
