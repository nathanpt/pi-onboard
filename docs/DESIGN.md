# pi-onboard Design

## Purpose

`pi-onboard` is a Pi extension for quickly understanding a repository and turning that understanding into durable onboarding artifacts.

The extension should not just print a one-time summary. It should create files that improve future sessions in the same repo.

## Product Vision

A user enters an unfamiliar repository and runs an onboarding command.

`pi-onboard` then:
1. inspects the repo,
2. infers what the project is,
3. identifies the important structure and common commands,
4. writes a practical `AGENTS.md` file for future harness sessions,
5. generates a visual HTML repo overview that the user can browse interactively.

The result should feel like creating a reusable orientation layer for the repo.

## Core Principles

- **Durable over flashy**: produce artifacts that help future work, not just a one-off answer.
- **Lean by default**: one command, one pass, minimal moving parts.
- **Static-first**: use repository file signals (manifests, scripts, configs, CI) for all inference. No LLM dependency for the MVP. Static signals cover the bulk of useful command and stack detection at zero cost; LLM enhancement is a post-MVP option.
- **Useful over exhaustive**: summarize the repo well enough to start working, not perfectly document every file.
- **Confidence-aware**: only infer commands and conventions when confidence is reasonably high.
- **Human-review friendly**: generated files should be editable, understandable, and safe to revise manually.

## MVP Scope

The first version should stay narrow.

### In scope
- Inspect the current repository root.
- Infer project purpose and stack.
- Identify important files and directories.
- Detect likely run, test, and lint commands when confidence is high.
- Generate an `AGENTS.md` draft in the repo root.
- Generate an HTML repo overview alongside the `AGENTS.md` file.
- Target Node/TypeScript and Python repositories first; other ecosystems (Cargo, Go, etc.) are best-effort and deferred until the core pass is proven.

### Out of scope
- Perfect support for every repo type.
- Deep code intelligence or LSP-level understanding.
- Automatic updates on file change.
- Complex multi-page web apps.
- Diagrams that require heavy rendering dependencies.
- Fully autonomous rewrite/update cycles.

## Primary Outputs

### 1. `AGENTS.md`
A durable text artifact for future harness sessions.

### 2. HTML repo overview
A visual companion artifact for the human.

This should help the user quickly understand:
- what the repo does,
- what matters most,
- where to look first,
- what commands likely matter,
- how the structure hangs together.

## Proposed Output Files

For MVP, generate both files in the repo root:

- `AGENTS.md`
- `pi-onboard-overview.html`

This keeps discovery obvious and avoids hidden state.

## MVP Command Behavior

The `/onboard` command is a single one-shot invocation. Supported flags (informed by research of analogous tools):

```text
/onboard                # full analysis, safe write
/onboard --dry-run      # preview output without writing any files
/onboard --force        # overwrite existing files (bypass draft behavior)
/onboard --text-only    # skip HTML overview generation (implies --no-serve)
/onboard --no-serve     # write the HTML file but do not start a server
/onboard --port N       # pin a server port (default: OS-assigned ephemeral)
/onboard --host ADDR    # bind address (default: 0.0.0.0; use 127.0.0.1 for local only)
/onboard --idle-timeout MIN  # server idle shutdown in minutes (default: 30; 0 = never)
/onboard --yes          # skip the preference interview, use defaults
/onboard --help         # show usage
```

The default invocation is safe-write: never clobber an existing hand-written file without `--force`. Pass `--yes` to skip the preference interview (see Adaptive Preference Interview) and generate non-interactively with defaults. Serving defaults to `0.0.0.0` on an OS-assigned port with a 30-minute idle timeout (see Serving the HTML overview).

## Recommended MVP interface

Start as a **slash command** first.

Selected MVP command:

```text
/onboard
```

Possible future aliases if useful:

```text
/init
/pi-onboard:init
```

### Why `/onboard` first
- it is clearer than the generic word `init`,
- it emphasizes understanding and orientation rather than setup alone,
- it still feels natural as a repo-entry action,
- it leaves room for future setup/bootstrap features without overloading the MVP.

A lower-level tool can come later if needed.

## Adaptive Preference Interview (`ask_user_question`)

When the host session provides a structured-question tool such as `ask_user_question`, pi-onboard should use it to let the user shape the generated artifacts before they are written. This is purely additive: when the tool is absent, the command runs one-shot with safe defaults and never blocks.

### Why
Different users want different output. A user on a context-limited coding agent benefits from a terse `AGENTS.md`; a user on a long-context model can afford more detail. RESEARCH_X_ADDENDUM.md repeatedly flags that overlong context files degrade agent performance (Anthropic's <200-line guidance, the ETH reassessment), so letting the user choose a detail level directly serves that finding.

### Capability detection
`ask_user_question` is not a built-in Pi tool; it is an environment-provided, LLM-callable tool that may or may not be active in a given session. Detect it at command invocation time, since tool sets can change mid-session:
- `pi.getActiveTools()` returns the tool names enabled for the current turn; prefer this.
- `pi.getAllTools()` returns all configured tools (each carries its own `promptGuidelines`, which the agent should respect when invoking it).

Behavior matrix:

| `ask_user_question` active? | Behavior |
|---|---|
| Yes | Before writing files, the agent asks a short set of preference questions via `ask_user_question`, then generation proceeds with the chosen preferences. |
| No | Generate with defaults (see below) and do not block. If `ctx.hasUI` is true (TUI/RPC), the extension MAY ask a minimal subset via `ctx.ui.select` / `ctx.ui.confirm`; otherwise fully non-interactive. |

Defaults (used when the tool is absent or `--yes` is passed): balanced detail, command-confidence floor at medium, all standard sections, both artifacts emitted.

### Example preference questions
Keep to a small, high-value set. The detail-level question is the anchor; the rest are optional for MVP.
- **Detail level** — Concise / Balanced / Detailed (the motivating example).
- **Command confidence floor** — High only / include Medium / include Low (maps to the Confidence Model).
- **Sections to include** (multiSelect) — Important paths, Commands, Conventions, Where to start, Open uncertainties.
- **Emit HTML overview?** — Yes / No (mirrors `--text-only`).

Exact question wording and ordering is an implementation detail; the design only commits to the detail-level question for MVP.

### Architecture fit and the static-first guarantee
The interview is a UX concern, not an inference concern. To preserve the static-first principle:
- the agent (via `ask_user_question`) handles only the preference interview;
- the extension's discovery and artifact layers remain deterministic and LLM-free, consuming the resolved preferences as plain inputs.

This keeps LLM involvement limited to asking questions the user already wants to answer. It does not introduce LLM-based command or stack inference.

### Preference handoff (resolved)

Chosen mechanism: **structured marker**. The agent asks the user via `ask_user_question`, then emits a single pi-onboard-owned marker line carrying the resolved preferences as JSON. The extension scans the captured assistant message for the marker and parses its own schema.

Marker format:

```text
<!-- pi-onboard:prefs {"detail":"concise","floor":"medium","html":true,"sections":["paths","commands","conventions"]} -->
```

Flow:
1. Discovery runs deterministically.
2. The extension attaches a scoped `message_end` listener to capture the assistant reply, and a scoped `tool_result` listener for `ask_user_question` as a fallback signal (below).
3. `pi.sendUserMessage(...)` triggers the interview: the agent asks via `ask_user_question`, then emits exactly one marker line echoing only what the user selected, then stops.
4. `ctx.waitForIdle()` blocks until the interview turn completes (guarded by a timeout).
5. The extension scans the captured reply for the marker with a tolerant JSON parser (ignoring code fences and trailing prose).
6. Generation proceeds deterministically with the parsed preferences.

Fallback refinement: if a `tool_result` for `ask_user_question` returns but no marker appears within a short window after `waitForIdle()`, the agent called the tool but forgot the marker. Fall back to defaults and note it in the completion summary.

Why marker over parsing the tool return: the marker contract is owned by pi-onboard, so it survives `ask_user_question` schema changes and works regardless of which tool the agent uses. Putting the label-to-key translation on the agent avoids the fragile label-matching that parsing the tool return would require.

### Resilience
The `/onboard` command must still produce correct output if the interview handoff fails or the user dismisses it: fall back to defaults, emit artifacts, and note the fallback in the completion summary.

## Expected MVP flow

When the user runs the command in a repo:

1. Validate the current directory is a repo or repo-like project folder.
2. Inspect high-signal files such as:
   - `README*`
   - `package.json`
   - `pyproject.toml`
   - `requirements.txt`
   - `Cargo.toml`
   - `go.mod`
   - `Makefile`
   - `docker-compose.yml`
   - CI config files
   - existing `AGENTS.md`, `CLAUDE.md`, or similar context files
3. Inspect top-level directories and likely important subfolders.
4. Infer:
   - project purpose,
   - stack/languages,
   - important directories,
   - likely run/test/lint commands,
   - local gotchas or conventions if visible.
5. Generate `AGENTS.md`.
6. Generate `pi-onboard-overview.html`.
7. If not `--no-serve`, ensure the HTML overview is being served (start or reuse a server).
8. Return a concise completion summary with paths, served URL(s), confidence notes, and a network warning.

## Suggested Completion Summary

Example shape:

```text
pi-onboard complete.
Created:
- /repo/AGENTS.md
- /repo/pi-onboard-overview.html

Serving (for 30 min, then auto-stops):
- http://10.0.1.42:49152/a7f3b2e1/
- http://192.168.1.5:49152/a7f3b2e1/

Note: bound to 0.0.0.0 — visible to other machines on this network.

Confidence notes:
- detected stack: high
- detected test command: medium
- detected lint command: low
```

If `--no-serve` or `--text-only` was used, omit the Serving block. If the server was reused from a prior run, show its existing URL and note "reusing running server". If the idle timeout is 0, show "(no auto-stop)" instead of the timeout.

## `AGENTS.md` Content Shape

The first version should use a stable, practical template.

## Proposed sections

```md
# AGENTS.md

## Project purpose
## Tech stack
## Important paths
## How to run
## How to test
## How to lint / validate
## Working conventions
## Where to start when making changes
## Open uncertainties
```

### Notes on quality
- If a command is uncertain, label it as likely rather than asserting it.
- Prefer short bullets over long prose.
- Avoid invented certainty.
- Make the file useful for a future coding harness session, not just for a human reader.

## HTML Overview Design

The HTML file is part of the value, not an afterthought.

## Purpose of the HTML file

It should give the user a quick visual mental model of the repo.

### Desired characteristics
- single-file HTML output,
- easy to open locally,
- visually attractive but lightweight,
- interactive enough to browse sections and collapse details,
- useful even without JavaScript-heavy infrastructure.

## What the page should show

### Top summary card
- repo name
- inferred purpose
- primary stack
- confidence level

### Important paths section
- top-level directories
- short explanation of each important directory

### Commands section
- run
- test
- lint
- build
- other useful commands
- confidence labels where needed

### Repo map / structure section
- structure-first or co-first with summary at the top
- simple visual hierarchy of important files and folders
- not a full tree dump
- curated/high-signal structure only
- should help the user build a mental map quickly, not just read a list

### Conventions / gotchas section
- notable patterns
- entrypoints
- places to avoid breaking
- unclear areas flagged honestly

### Next steps section
- where a human or harness should inspect first
- suggested first files to read

## HTML style direction

The user specifically wants this to feel similar to the interactive planning HTML pages they liked.

For MVP, that means:
- dark theme,
- modern card-based layout,
- collapsible sections,
- lightweight interactivity,
- visually clean repo summary experience.

It is acceptable to take inspiration from existing planning HTML aesthetics as long as the output is adapted to this repo-onboarding use case.

## Recommended MVP HTML constraint

Do not build a complex front-end app.

Generate one self-contained HTML file with:
- embedded CSS,
- minimal inline JavaScript,
- no framework dependency.

## Serving the HTML overview

The HTML overview must be reachable from a browser, and the user may not be working on the same machine as the one running pi (remote dev boxes, SSH sessions, CI runners behind a tunnel). Writing the file to disk is necessary but not sufficient for that case.

### Write and serve
Write `pi-onboard-overview.html` to the repo root (durable, git-trackable) **and** serve the same bytes over HTTP. One code path: the server reads and returns the file contents. This preserves the durable-artifact principle while solving remote access. Use `--no-serve` to skip serving; `--text-only` skips both HTML generation and serving.

### Implementation
Use Node's built-in `http` module directly. No framework, no dependencies (Pi exposes no server primitive to extensions). The served page stays the same self-contained HTML file described above; serving only delivers bytes. No live-reload (that is watch mode, already out of scope).

### Server lifecycle
The server is a dumb byte-pipe over the file; re-viewing it never re-runs analysis. Lifecycle is governed by an **idle timeout**, not by session tracking:

- **Idle** means no HTTP requests to the server for the timeout window.
- The server stops on **whichever comes first**: the idle timeout elapses (primary mechanism), the `session_shutdown` event fires (cleanup insurance), or the pi process exits (backstop).
- Re-running `/onboard` while a server is already live **reuses that server and its port** and resets the idle timer; a new port is allocated only when no server is live.
- Mental model for the user: the overview stays viewable for 30 minutes after they last looked at it.

Default idle timeout is 30 minutes; override with `--idle-timeout MIN` (use `0` to disable idle auto-stop; session/exit teardown always applies).

### Host, port, and URL
- **Host:** `0.0.0.0` by default, so the overview is reachable from remote machines. Override with `--host 127.0.0.1` for local-only access.
- **Port:** OS-assigned ephemeral by default (avoids conflicts). Pin with `--port N`.
- **URL token:** serve under an unguessable path segment (e.g. `/<token>/`) rather than `/`, as cheap defense in depth.
- On startup, enumerate candidate URLs via `os.networkInterfaces()` and print all of them so the user gets a working link immediately.

### Security posture
Binding to `0.0.0.0` is a conscious default: anyone who can reach the port and the URL token can view the overview. The overview is repo-derived (directory structure, paths, likely commands, conventions), so it is a mild information leak for private repos and negligible for OSS. Mitigations in place: unguessable URL token, a one-line network warning in the completion summary, an idle auto-stop, and `--host 127.0.0.1` as an escape hatch. For the normal case (dev box or CI runner behind a tunnel) this is acceptable.

## File Creation Policy

Recommended MVP behavior:

### If `AGENTS.md` does not exist
- create it.

### If `AGENTS.md` already exists
- do **not** overwrite automatically.
- behavior depends on whether pi-onboard section markers are present:
  - if the file contains pi-onboard markers (`<!-- pi-onboard:START section=foo -->` / `<!-- pi-onboard:END section=foo -->`), update only the marked sections and leave hand-edited content untouched;
  - if the file has no markers, create a draft variant instead: `AGENTS.pi-onboard.draft.md`.

### If HTML overview already exists
- detect whether it was previously generated by pi-onboard via a top-of-file marker: `<!-- generated by pi-onboard -->`;
- if the marker is present, overwrite (or respect draft semantics unless `--force` is set);
- if the marker is absent, write `pi-onboard-overview.draft.html` instead of clobbering a hand-written file.

### With `--force`
- bypass all draft behavior and overwrite both files in place.

This keeps the first version safe and trustable.

## Confidence Model

The command should distinguish between:
- **high confidence**: directly supported by obvious repo files,
- **medium confidence**: likely inferred from common patterns,
- **low confidence**: plausible but uncertain.
- **suppress**: no supporting signal at all — do not emit the guess.

This matters most for commands and conventions.

## First Target Repo Strategy

The first version should target one real repo well before trying to generalize.

Best candidate:
- the Pi web access extension repo or a repo with a similarly understandable structure.

Why:
- real current user need,
- immediate feedback loop,
- avoids building for abstract imaginary repos.

## Non-Goals for MVP

Do not try to solve all of these yet:
- full dependency graph visualization,
- code-level architecture diagrams,
- AST indexing,
- semantic search,
- multi-language perfection,
- repository-wide planning,
- issue/task generation.

These can become later extensions once the core onboarding pass is genuinely useful.

## Suggested Internal Architecture

For design purposes, think of the extension as 3 layers:

### 1. Discovery layer
Collect repo signals.

### 2. Synthesis layer
Turn those signals into structured understanding.

### 3. Artifact layer
Write:
- `AGENTS.md`
- `pi-onboard-overview.html`

This separation should make future iteration easier.

## Packaging & Distribution

pi-onboard ships as a public Pi package installable from npm or git and listed on the [pi.dev/packages](https://pi.dev/packages) gallery. This section captures the packaging conventions the implementation must follow so it installs cleanly via the standard `pi install` command.

### `package.json` shape

```json
{
  "name": "@nathanpt/pi-onboard",
  "version": "0.1.0",
  "description": "Pi extension for onboarding into a repository: generates AGENTS.md and a visual HTML overview.",
  "license": "MIT",
  "type": "module",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions/index.ts"]
  },
  "publishConfig": {
    "access": "public"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*"
  }
}
```

Conventions enforced:
- **`keywords: ["pi-package"]` is required** for the package to appear in the pi.dev/packages gallery at all.
- **`type: "module"`** and TypeScript loaded directly — no build step, no transpiled output to ship. Pi resolves `.ts` entry points itself.
- **`pi.extensions`** manifest points at the entry file (paths relative to the package root). This is more explicit than relying on auto-discovery from an `extensions/` directory.
- **No runtime `dependencies`** — the server uses only Node built-ins (`node:http`, `node:os`, `node:net`), which are always available to extensions. This keeps the install footprint at zero.
- **Pi core packages are peer dependencies with `"*"`, never bundled.** `@earendil-works/pi-coding-agent` is imported for `ExtensionAPI` types. If a tool is registered later (needing `typebox` schemas), add `typebox` / `@earendil-works/pi-ai` to `peerDependencies` too — do not bundle them.
- **Do not set `private: true`** — that would block `npm publish`.

### Entry point and repo layout

```
extensions/
  index.ts            # export default function (pi: ExtensionAPI) { ... }
docs/                 # DESIGN.md, RESEARCH_*.md
package.json
README.md
```

The entry point is the default-export factory:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("onboard", {
    description: "Onboard into a repo: generate AGENTS.md and HTML overview",
    getArgumentCompletions: (prefix) => completionsForFlags(prefix),
    handler: async (args, ctx) => { /* ... */ },
  });
}
```

Note on `registerCommand` options: the current Pi API accepts `description`, optional `getArgumentCompletions`, and `handler`. There is **no `argumentHint` option** (see the erratum added to RESEARCH_FINDINGS.md §2.11).

### Distribution

```bash
# From npm (primary)
pi install npm:@nathanpt/pi-onboard
pi install npm:@nathanpt/pi-onboard@0.1.0   # pinned, skipped by updates

# From git
pi install git:github.com/nathanpt/pi-onboard
pi install git:github.com/nathanpt/pi-onboard@v0.1.0

# Trial without installing
pi -e npm:@nathanpt/pi-onboard
```

Per-user installs write to `~/.pi/agent/settings.json`; `-l` writes project-local `.pi/settings.json` for team sharing.

### Gallery featuring

The pi.dev/packages gallery displays packages tagged `pi-package`. To make pi-onboard present well (and eligible for featuring), add a preview under the `pi` key:

```json
"pi": {
  "extensions": ["./extensions/index.ts"],
  "image": "https://raw.githubusercontent.com/nathanpt/pi-onboard/main/docs/preview.png"
}
```

- `image`: PNG/JPEG/GIF/WebP, static preview. A screenshot of the HTML overview is the natural choice.
- `video`: optional MP4; takes precedence over `image` if both are set.

### Security note for reviewers

The pi.dev/packages gallery frames packages as "run with full system access; review source before installing." Two pi-onboard behaviors deserve a sentence in the README aimed at reviewers:

1. **The `/onboard` server binds to `0.0.0.0` by default.** It exposes only the generated overview (repo-derived paths/commands/conventions), not arbitrary file access, and auto-stops when idle. This is intentional for remote-machine use and is overridable via `--host 127.0.0.1`.
2. **No network calls are made by discovery or generation** — the HTTP server is the only network surface, and it only listens (no outbound requests).

## Definition of Success

The MVP succeeds if, on one real repo:
- the generated `AGENTS.md` is useful enough that you would actually keep it,
- the HTML file gives a clearer mental model than a plain text dump,
- the command feels like a real onboarding action rather than a demo,
- the output makes the next harness session better.

## Immediate Next Design Questions

These are the main questions before implementation.

### Resolved by research (see RESEARCH_FINDINGS.md)

- **Should the command always emit both files, or allow text-only / html-only later?**
  Resolved: support `--text-only` to skip HTML generation. Default emits both.
- **How should draft/update behavior work for an existing HTML overview file?**
  Resolved: detect prior pi-onboard generation via `<!-- generated by pi-onboard -->`; overwrite if present, otherwise write a `.draft.html`.
- **What confidence thresholds should suppress weak command guesses instead of showing them?**
  Resolved: suppress when there is no supporting signal at all; otherwise show high/medium/low with evidence. See Confidence Model.

### Still open

1. What exact HTML layout from the planning tool is worth imitating?
2. Should the first repo map be curated manually by heuristics, or include a shallow tree preview?

## Current Recommendation

For MVP:
- use `/onboard` as the primary slash command,
- default to generating both artifacts (use `--text-only` to skip the HTML),
- default to safe draft behavior over overwrite,
- when `ask_user_question` is available, run a short preference interview before generating; otherwise fall back to defaults (`--yes` skips it),
- write the HTML overview file and serve it over HTTP (session idle lifecycle, 0.0.0.0 by default),
- use a single-file dark interactive HTML page,
- make the structure/map section prominent early in the page,
- target one real repo first,
- optimize for usefulness, not completeness.
- ship as a public Pi package: `keywords: ["pi-package"]`, `pi.extensions` manifest in `package.json`, empty runtime `dependencies`, pi core as `peerDependencies`, distributed via `npm:` and `git:` for the pi.dev/packages gallery.
