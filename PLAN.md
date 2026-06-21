# pi-onboard Implementation Plan

> Implements the MVP described in [`docs/DESIGN.md`](docs/DESIGN.md). This plan is
> built bottom-up in **testable vertical slices**: each phase produces something
> you can run and eyeball before moving on.

## Context

`pi-onboard` is a Pi extension (`/onboard` command) that inspects a repo and
generates two durable artifacts: an `AGENTS.md` (lean, confidence-aware) and a
`pi-onboard-overview.html` (dark, interactive), plus an HTTP server so the HTML
is reachable from remote machines. All inference is static (no LLM); the only
LLM touch is an optional preference interview via `ask_user_question`.

The repo is currently docs-only (2 commits, `main`). This plan adds the
implementation: `extensions/` source, `package.json`, and a first working cut.

## Grounded API facts (verified against pi 0.79.9)

These shape the implementation and must not be re-derived:

- **Command registration:** `pi.registerCommand("onboard", { description, getArgumentCompletions?, handler })` — **no `argumentHint`** (see RESEARCH_FINDINGS.md erratum).
- **Multi-file extensions:** sibling relative imports work, e.g. `import { x } from "./utils.ts"` (confirmed in `examples/extensions/plan-mode/`). jiti resolves `.ts` directly — **no build step**.
- **Server teardown event:** `pi.on("session_shutdown", (event, ctx) => ...)` where `event.reason` is `"quit"|"reload"|"new"|"resume"|"fork"`.
- **Tool detection (interview):** `pi.getActiveTools(): string[]` (preferred) / `pi.getAllTools(): ToolInfo[]`.
- **Interview handoff:** `pi.sendUserMessage(...)`, `ctx.waitForIdle()`, `pi.on("message_end", ...)` / `pi.on("tool_result", ...)`.
- **UI fallback primitives:** `ctx.ui.select(title, options)`, `ctx.ui.confirm(title, msg)`, `ctx.hasUI`.
- **Node built-ins available:** `node:fs`, `node:path`, `node:http`, `node:os`, `node:net`, `node:crypto` (for the URL token). **No npm runtime dependencies.**
- **Packaging:** `package.json` with `keywords:["pi-package"]`, `pi.extensions:["./extensions/index.ts"]`, `type:"module"`, pi core in `peerDependencies` (not bundled).

## Approach

Follow the design's **3-layer architecture** as separate modules, wired by a
thin `index.ts` orchestrator. Build discovery → synthesis → artifacts → serving
→ interview, testing each layer on one real target repo.

## Target repo

DESIGN.md names "the Pi web access extension repo" but its existence is
unverified. **Pragmatic fallback:** dogfood on a known-good Node/TS repo with a
clear `package.json` (e.g. pi-onboard itself once Phase 2 lands, or another
local repo like pi-web-access if present). This removes a blocker.

## File structure

```
extensions/
  index.ts          # entry: registerCommand + orchestration + completion summary
  flags.ts          # flag parsing (--dry-run, --force, etc.) + --help text + completions
  types.ts          # shared types: RepoContext, Confidence, Command, Preferences
  discovery.ts      # Layer 1: walk repo, read high-signal files → RepoContext
  synthesis.ts      # Layer 2: infer purpose/stack/commands/dirs + confidence
  agents-md.ts      # Layer 3a: AGENTS.md generation + marker/draft/force file safety
  html.ts           # Layer 3b: self-contained dark HTML generation
  server.ts         # Layer 3c: HTTP server (idle lifecycle, teardown, reuse, token)
  interview.ts      # ask_user_question detection + marker handoff + fallback
package.json        # package manifest (pi.extensions)
```

## Reuse

- **Ignore set** (node_modules, dist, build, .git, .venv, __pycache__, …) — from RESEARCH_FINDINGS.md §3.2.
- **RepoContext interface** shape — adapt from mitosisdev/agents-md-gen (RESEARCH_FINDINGS.md §2.2): `{ name, description, language, runtime, scripts, deps, srcFiles, readmeSummary, hasExistingContext }`.
- **Script label mapping** (npm `test`→"Test", `lint`→"Lint", `start`/`dev`→"Run") — from RESEARCH_FINDINGS.md §2.2.
- **Confidence assignment** table — from RESEARCH_FINDINGS.md §3.6 / DESIGN.md Confidence Model.
- **Pi extension boilerplate** — from `examples/extensions/tools.ts` + `examples/extensions/shutdown-command.ts`.

## Steps

### Phase 1 — Skeleton & command wiring
- [ ] Create `package.json` (from DESIGN.md "Packaging & Distribution" shape: `@nathanpt/pi-onboard`, MIT, `pi.extensions`, peerDeps, `publishConfig.access`).
- [ ] Create `extensions/flags.ts`: parse `args` string into a typed `Options` object; handle `--help` (print usage, return `null`), unknown flags (warn). Implement `getArgumentCompletions(prefix)` returning flag completions.
- [ ] Create `extensions/types.ts`: `Confidence = "high"|"medium"|"low"`, `Command { label, command, confidence, evidence }`, `RepoContext`, `Preferences`, `Options`.
- [ ] Create `extensions/index.ts`: `export default function(pi)` → `pi.registerCommand("onboard", { description, getArgumentCompletions, handler })`. Handler parses flags; on `--help` print usage and return; else call a stubbed `runOnboard(options, ctx)` that logs "not implemented".
- [ ] **Verify:** `pi -e .` loads the extension; `/onboard --help` prints usage; `/onboard` runs the stub without error.

### Phase 2 — Discovery layer
- [ ] Create `extensions/discovery.ts`: `discover(cwd): RepoContext`.
  - Walk top-level + depth-1 subdirs using `node:fs`/`node:path`, applying the ignore set.
  - Read high-signal files (README* first 500 chars, package.json, pyproject.toml/requirements.txt, Makefile, CI configs, existing AGENTS.md/CLAUDE.md). Guard every read with try/catch + existence checks.
  - Count file extensions for language voting (.ts, .js, .py, .rs, .go, …).
  - Collect top-level directory names + known-important subdirs (src, app, lib, tests, docs, scripts, cmd, pkg, api).
  - Surface raw package.json `scripts` and dependencies for synthesis.
- [ ] **Verify:** temporary log the `RepoContext` JSON; run `/onboard` in a real Node repo and confirm scripts/deps/dirs are captured.

### Phase 3 — Synthesis layer
- [ ] Create `extensions/synthesis.ts`: `synthesize(ctx: RepoContext): Analysis`.
  - **Purpose:** README first sentence → `package.json` description → repo name (descending fallback).
  - **Stack:** language by extension vote + framework from deps (react, fastapi, express, …) with confidence.
  - **Commands:** map scripts/Makefile targets → run/test/lint/build using the label map; assign confidence (high=script present, medium=config present but no script, low=common pattern, suppress=nothing). Apply the confidence floor from Preferences.
  - **Important dirs:** known-name heuristic with one-line explanations.
  - **Conventions:** surface obvious signals (TS strict in tsconfig, type field, presence of CI).
- [ ] **Verify:** log the `Analysis`; confirm confidence labels are correct and weak guesses are suppressed.

### Phase 4 — AGENTS.md generation
- [ ] Create `extensions/agents-md.ts`: `generateAgentsMd(analysis, prefs): string`.
  - Render DESIGN.md sections (purpose, stack, important paths, how to run/test/lint, conventions, where to start, open uncertainties) with `<!-- pi-onboard:START section=X -->` / `<!-- pi-onboard:END section=X -->` markers around each.
  - Respect detail level: concise (fewer sections/bullets) / balanced / detailed.
  - Hard cap ~200 lines (research guidance).
- [ ] Implement file-safety writer `writeAgentsMd(cwd, content, force)`:
  - No existing file → write `AGENTS.md`.
  - Exists with markers → update marked sections only, preserve the rest.
  - Exists, no markers, no `--force` → write `AGENTS.pi-onboard.draft.md`.
  - `--force` → overwrite in place.
- [ ] Honor `--dry-run` (return content without writing) and `--text-only` (skip).
- [ ] **Verify:** run in a fresh repo → `AGENTS.md` created with markers; run again → markers updated, hand-edits preserved; run in a repo with hand-written `AGENTS.md` → `.draft.md` created.

### Phase 5 — HTML generation
- [ ] Create `extensions/html.ts`: `generateHtml(analysis, prefs): string`.
  - Single self-contained file: embedded CSS (dark theme), minimal inline JS (collapsible sections), no framework.
  - Sections per DESIGN.md "What the page should show": top summary card → repo map (prominent, curated + shallow depth-1 preview, not a full dump) → commands with color-coded confidence badges (green/yellow/red) → conventions → next steps.
  - Top-of-file marker `<!-- generated by pi-onboard -->` for detection.
- [ ] Implement file-safety writer `writeHtml(cwd, content, force)` mirroring AGENTS.md policy (detect marker → overwrite; else `.draft.html`; `--force` overwrites).
- [ ] Honor `--dry-run` and (via flag) skip when `--text-only`.
- [ ] **Verify:** open generated `.html` in a browser; confirm dark theme, collapsible sections, confidence badges render.

### Phase 6 — HTTP server
- [ ] Create `extensions/server.ts`: a module-level singleton server with `ensureServer(cwd, opts)` → `{ urls, reused }`.
  - Use `node:http`; bind `opts.host` (default `0.0.0.0`); port `opts.port` (default `0` = OS-assigned).
  - Generate an unguessable URL token via `node:crypto.randomUUID()`; serve only `/<token>/`; 404 otherwise.
  - Server reads `pi-onboard-overview.html` from cwd on each request (dumb byte-pipe; no re-analysis).
  - **Idle timer:** reset on each request; fire `server.close()` after `opts.idleTimeout` minutes (0 = disabled).
  - **Reuse:** if a server is already live, return its existing urls + reset the timer; don't allocate a new port.
  - Enumerate candidate URLs via `node:os.networkInterfaces()` filtering for IPv4 non-internal.
- [ ] In `index.ts`, register `pi.on("session_shutdown", ...)` once to close any live server (cleanup insurance); process exit is the backstop.
- [ ] Honor `--no-serve` (skip) and `--text-only` (skip). `--dry-run` skips.
- [ ] **Verify:** run `/onboard`, `curl http://<ip>:<port>/<token>/` from another machine; confirm the page; leave idle, confirm auto-shutdown; re-run `/onboard`, confirm port reuse.

### Phase 7 — Preference interview
- [ ] Create `extensions/interview.ts`: `maybeInterview(pi, ctx, opts): Promise<Preferences>`.
  - If `opts.yes` → return defaults immediately.
  - Detect `ask_user_question` via `pi.getActiveTools()`.
  - If absent: if `ctx.hasUI`, optionally ask the detail-level question via `ctx.ui.select(...)`; else return defaults. Never block.
  - If present: attach scoped `message_end` + `tool_result` listeners; `pi.sendUserMessage(...)` instructing the agent to ask via `ask_user_question` then emit exactly one `<!-- pi-onboard:prefs {...} -->` marker; `ctx.waitForIdle()` (timeout-guarded); scan captured assistant text for the marker with a tolerant parser (strip code fences); `JSON.parse`.
  - **Fallback:** tool returned but no marker → defaults + note. Any failure → defaults + note.
- [ ] Wire `maybeInterview` into `index.ts` **before** generation (after discovery, since prefs can set confidence floor + sections + html flag).
- [ ] **Verify:** with `ask_user_question` available, confirm the marker is captured and prefs applied (e.g., "concise" shrinks AGENTS.md); with it absent, confirm non-blocking defaults; with `--yes`, confirm skipped.

### Phase 8 — Orchestration, completion summary & polish
- [ ] Wire the full `runOnboard` flow in `index.ts` per DESIGN.md "Expected MVP flow" (validate cwd → discover → interview → synthesize → write AGENTS.md → write HTML → ensure server → summary).
- [ ] Implement the completion summary exactly per DESIGN.md "Suggested Completion Summary": paths, serving block (urls + timeout/reuse/no-auto-stop), network warning (0.0.0.0), confidence notes. Omit serving block on `--no-serve`/`--text-only`.
- [ ] Error handling: every layer try/catch; a discovery/write/server failure should produce a clear message, not a crash. Use `ctx.ui.notify(...)` for user-facing errors.
- [ ] Sweep: remove debug logs; ensure `--dry-run` writes nothing and prints a preview instead.
- [ ] **Verify:** end-to-end `/onboard` on a real repo produces both files, serves them, and prints an accurate summary.

### Phase 9 — Publish readiness
- [ ] Add `package.json` `pi.image` preview field (placeholder path; capture a real screenshot after Phase 5).
- [ ] Final README accuracy check (flags list matches implementation).
- [ ] `npm pack` → inspect the tarball contains only `extensions/`, `package.json`, `README.md`, `LICENSE` (no docs, no node_modules, no .git).
- [ ] `npm publish` (scoped→public via publishConfig). Then `pi install npm:@nathanpt/pi-onboard` in a clean dir to confirm it installs and loads.

## Open design questions (handle pragmatically during build)

1. **HTML layout** (open Q1) — implement a clean dark card-based layout with collapsible sections; iterate visually once Phase 5 runs. No blocker.
2. **Repo map style** (open Q2) — for MVP use **curated heuristics** (known dir names) **plus a shallow depth-1 tree preview** of top-level entries (not a recursive dump). This is the lowest-risk blend of both options and resolves Q2 during Phase 5.

## Verification (end-to-end)

After Phase 8, the definition of success (DESIGN.md) is met when, on one real repo:
- `/onboard` generates an `AGENTS.md` useful enough to keep.
- The HTML overview gives a clearer mental model than a text dump.
- The server URL works from a browser on another machine.
- Re-running updates marker sections without clobbering hand-edits.
- `/onboard --yes` skips the interview; `/onboard --text-only` skips HTML+server.
- `pi -e .` and `pi install npm:@nathanpt/pi-onboard` both load the extension cleanly.
