# pi-onboard Research Findings

> Research conducted June 2026. Purpose: inform MVP implementation decisions by learning from existing projects, tools, and patterns.

---

## 1. Executive Summary

### Top takeaways

1. **The field is nascent but active.** At least 10+ public GitHub repos ship AGENTS.md generators. Most are <3 months old, 0-10 stars, single-author projects. This is a greenfield opportunity, not a crowded market.

2. **Two distinct philosophies exist:**
   - **Static/rule-based** (repo-radar, mitosisdev/agents-md-gen): scan file system → fill template → write file. Lightweight, no LLM dependency, deterministic.
   - **LLM-enhanced** (davidcjw/agents-md-generator, markoblogo/AGENTS.md_generator): scan → send context to LLM → generate richer sections. Better quality, but adds latency/cost.

3. **No existing tool combines AGENTS.md generation + HTML repo visualization in one command.** This is pi-onboard's strongest differentiator.

4. **The most successful (by adoption) is cc-rig (31★),** which is full Claude Code project setup — far beyond pi-onboard's scope. Its key insight: generate multi-file structure, not just one file.

5. **repo-seatbelt (8★)** is the closest to pi-onboard's AGENTS.md generation goal, but its focus is safety/guardrails, not onboarding orientation.

6. **The Pi extension ecosystem is real and well-documented.** Multiple extensions (pi-fallow, pi-code-mode, pi-hotkey-commands) demonstrate the exact `pi.registerCommand()` pattern needed.

### Strongest directions for pi-onboard

- **Copy** the static scanner-first approach from repo-radar and mitosisdev/agents-md-gen — lightweight, no dependencies, deterministic core
- **Copy** the marker-based section management from markoblogo/AGENTS.md_generator (<!-- AGENTSGEN:START/END -->) for safe partial updates
- **Copy** the AGENTS.md section structure from agents-md-gen (Project Overview → Commands → Architecture → Key Conventions → Agent Notes)
- **Differentiate** with the HTML visualization artifact — no existing tool ships one
- **Borrow** the draft behavior (write *.generated.md / *.draft.md when target exists) from markoblogo and agents-md-gen

### Biggest traps to avoid

- **Don't build a full code intelligence pipeline.** codebase-memory-map and ai-repo-adventures are full-stack apps with DBs, LLM orchestration, and heavy infrastructure. That's the opposite of pi-onboard's lean mandate.
- **Don't over-invest in multi-language perfection for MVP.** Focus on Node/TypeScript and Python repos first, based on real user need.
- **Don't use LLM for every inference.** Static signals (package.json scripts, file extensions, Makefile targets, CI config) cover 80% of useful command detection with zero cost.
- **Don't generate bloated AGENTS.md.** Several generators produce 200+ line files. The design doc explicitly calls for lean, useful, confidence-aware output.

---

## 2. Best Candidate Projects (Ranked)

### Tier 1: Directly relevant — copy ideas now

| # | Project | Stars | Why it matters |
|---|---------|-------|----------------|
| 1 | **markoblogo/AGENTS.md_generator** | 4★ | Most mature AGENTS.md generator. Python CLI + MCP server. Marker-based safe edits. LLM-enhanced but falls back cleanly. |
| 2 | **mitosisdev/agents-md-gen** | 0★ | Cleanest TypeScript implementation. Scanner module (60 lines) → Generator module (120 lines). Perfectly scoped for imitation. |
| 3 | **niuxinhuai/repo-radar** | 0★ | Tiny (5KB, zero dependencies). Scans repo and outputs JSON or AGENTS.md draft. Minimalist philosophy matches pi-onboard's lean goal. |
| 4 | **repo-seatbelt** | 8★ | CLAUDE.md/AGENTS.md generator + MCP guardrails. Strong safety patterns. Well-documented CLI commands. |

#### 1. markoblogo/AGENTS.md_generator (`agentsgen`)
- **URL:** https://github.com/markoblogo/AGENTS.md_generator
- **What to copy:**
  - Marker-based section management (`<!-- AGENTSGEN:START section=foo -->` / `<!-- AGENTSGEN:END section=foo -->`). Enables safe partial regeneration without overwriting hand-edited sections.
  - "Safe by default" file write: generates `*.generated.md` when the target file exists without markers.
  - Template system: Jinja-like templates per language (node/ templates, python/ templates).
  - Diff-first workflow: checks for drift before writing.
- **What to avoid:** The ABVX ecosystem coupling (SET, ID, abvx-agent-skills) — overengineered for MVP. The 6MB+ repo size (lots of ecosystem tooling).
- **Implementation clues:** Use HTML comment markers for section boundaries. Keep templates as simple text files.

#### 2. mitosisdev/agents-md-gen
- **URL:** https://github.com/mitosisdev/agents-md-gen
- **What to copy:**
  - Clean two-module architecture: `scanner.ts` (extract RepoContext) → `generator.ts` (render AGENTS.md). Total: ~180 lines.
  - RepoContext interface: `{ name, description, version, language, runtime, scripts, devDependencies, srcFiles, readmeSummary, existingAgentContext, hasTsConfig }` — this is the right schema for MVP.
  - Fallback patterns: every section has a fallback when data is missing ("_No scripts defined_", "_No src/ directory found_", "_No conventions detected_").
  - Script label mapping (npm `test` → "Test", `lint` → "Lint", `start` → "Run").
- **What to avoid:** The hardcoded assumption that package.json is required (pi-onboard should handle repos without Node.js). The "bun or node" binary detection (too narrow for MVP).
- **Implementation clues:** The exact RepoContext interface can be adapted directly. The generator produces AGENTS.md section-by-section with `## SectionName` headers and HTML review-comment reminders.

#### 3. niuxinhuai/repo-radar
- **URL:** https://github.com/niuxinhuai/repo-radar
- **What to copy:**
  - Zero-dependency approach. Single file with Node built-ins (fs, path). Total source: ~100 lines.
  - File-type counting and top-directory extraction as simple heuristics.
  - `--agents` flag to output AGENTS.md directly.
  - Ignore set: `.git`, `node_modules`, `dist`, `build`, `.next`, `.turbo`, `.venv`, `coverage`.
- **What to avoid:** The output is too minimal (just file counts + scripts + entry candidates). Missing: project purpose inference, important directory explanations, conventions.
- **Implementation clues:** The walk + filter + count pattern is the right starting point for the discovery layer. Extend with language-specific signals (pyproject.toml, Cargo.toml, go.mod, Makefile).

#### 4. berkcangumusisik/repo-seatbelt
- **URL:** https://github.com/berkcangumusisik/repo-seatbelt
- **What to copy:**
  - Multi-tool output formats (AGENTS.md + CLAUDE.md + cursor rules). Suggests pi-onboard could eventually support multiple formats.
  - JSON output mode for machine-readable results.
  - Command-line UX with subcommands and flags.
- **What to avoid:** The safety/guardrail focus is out of scope for pi-onboard MVP. The MCP server complexity. The AI safety scoring system.
- **Implementation clues:** The concept of "presets" (different config profiles for different tool ecosystems) could inform future pi-onboard expansion.

### Tier 2: Relevant for patterns and inspiration

| # | Project | Stars | Why it matters |
|---|---------|-------|----------------|
| 5 | **cc-rig** | 31★ | Most popular Agent context generator. Claude Code project setup. Generate 30+ files from 2 questions. |
| 6 | **rpipboard-scaffold** | 2★ | Claude Code plugin with `/scaffold` command. AGENTS.md + CLAUDE.md + skills generation. |
| 7 | **davidcjw/agents-md-generator** | 1★ | Web UI for AGENTS.md generation. Shows what sections matter. |
| 8 | **DanWahlin/ai-repo-adventures** | 7★ | Generates self-contained HTML from repo analysis. Thematic, interactive. |
| 9 | **actual-skill-openclaw** | 4★ | ADR-powered CLAUDE.md/AGENTS.md generator. Shows skill/extension pattern. |
| 10 | **parcadei/bloks** | 13★ | Context card generator for AI agents. Progressive disclosure design. |

#### 5. runtimenoteslabs/cc-rig
- **URL:** https://github.com/runtimenoteslabs/cc-rig
- **What to copy:**
  - The guided setup flow: ask 2 questions → generate full context. Pi-onboard could add an interactive mode later.
  - The concept of generating multiple companion files (CLAUDE.md, CLAUDE.local.md, `.claude/commands/`, etc.) — though pi-onboard should stay lean.
  - The "nothing proprietary" philosophy — generated files are plain markdown, no lock-in.
- **What to avoid:** The massive scope (30+ files, agent definitions, hooks, plugins, skills, memory, CI). This is the opposite of pi-onboard's "lean by default" principle.

#### 6. AnantKumar17/repo-scaffold
- **URL:** https://github.com/AnantKumar17/repo-scaffold
- **What to copy:**
  - `/scaffold` command UX with flags: `--dry-run`, `--force`, `--skills-only`, `--claude-md-only`, `--agents-md-only`.
  - SessionStart hook to auto-prompt when CLAUDE.md is missing — a nice UX touch for future pi-onboard.
  - The concept of "what gets generated" documentation showing exact output examples.
- **What to avoid:** The complex plugin installation system (copy to `~/.claude/plugins/`, symlinks, enabledPlugins config). Pi extensions are simpler.
- **Implementation clues:** The flag pattern (`--dry-run`, `--force`) is worth adopting for `/onboard`.

#### 7. davidcjw/agents-md-generator
- **URL:** https://github.com/davidcjw/agents-md-generator
- **What to copy:**
  - The section prioritization: only generate sections backed by real evidence in the repo. Sections: Installation, Executable Commands, Folder Structure, Testing, Linting, Deployment, PR Instructions, Coding Guidelines, Do-Not Rules, Styling Guide.
  - Hard cap at 200 lines — forces conciseness.
  - Priority-order file fetching: README → package.json → lint/test configs → CI workflows.
- **What to avoid:** Web UI focus (Next.js app) — irrelevant to a Pi slash command. LLM dependency for every generation (cost, latency).
- **Implementation clues:** The evidence-based section generation principle is excellent. If there's no test config, don't include a test section.

#### 8. DanWahlin/ai-repo-adventures
- **URL:** https://github.com/danwahlin/ai-repo-adventures
- **What to copy:**
  - Self-contained HTML generation from repo analysis. The HTML is standalone, themed, and interactive.
  - The template engine pattern: Theme CSS + Templates → HTMLBuilder → standalone page.
  - Dark/light mode toggle, responsive design, code highlighting.
- **What to avoid:** The "choose your own adventure" gamification (fun but scope creep for MVP). The MCP server complexity. The LLM requirement for story generation.
- **Implementation clues:** For pi-onboard's HTML: a much simpler template engine (just string interpolation, not a full theme system). Single-file HTML with inline CSS + minimal JS for collapsible sections.

#### 9. parcadei/bloks
- **URL:** https://github.com/parcadei/bloks
- **What to copy:**
  - Progressive disclosure hierarchy: deck → module → symbol. For pi-onboard: summary → section → detail.
  - The "card" metaphor could influence how HTML sections are designed (discrete, collapsible cards with titles).
- **What to avoid:** The Rust/Cargo dependency. The library indexing focus (not repo onboarding).

### Tier 3: Ecosystem context — understand before building

| # | Project | Stars | Why it matters |
|---|---------|-------|----------------|
| 11 | **pi-fallow** | 8★ | Real Pi extension with slash command + tool. Reference implementation for Pi extension structure. |
| 12 | **oh-my-pi** | 13.5K★ | Dominant Pi distribution. Check if it has built-in onboarding features. (It doesn't — confirmed.) |
| 13 | **pi-code-mode** | 5★ | Simple Pi extension with `/codemode` command. Clean example of minimal extension. |
| 14 | **pi-lazy-loader** | 1★ | Lazy-loading pattern for Pi extensions. Useful if pi-onboard grows beyond MVP. |

#### 11. revazi/pi-fallow
- **URL:** https://github.com/revazi/pi-fallow
- **What to copy:**
  - **Exact Pi extension registration pattern:**
    ```typescript
    import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

    export default function (pi: ExtensionAPI) {
      pi.registerCommand("onboard", {
        description: "...",
        argumentHint: "[options]",
        getArgumentCompletions: ...,
        handler: (rawArgs, ctx) => { ... },
      });
    }
    ```
  - Tool registration alongside command: pi-onboard core is a single slash command, but could register a tool later.
  - Structured extension directory: `extensions/command/` sub-organization.
- **Implementation clues:** Use `pi.registerCommand()` as the entry point. The `ExtensionAPI` type from `@earendil-works/pi-coding-agent` is the type system to target.

> **Errata (2026-06-20):** The code block above includes `argumentHint: "[options]"`. This option **does not exist** in the current Pi API. Verified against `dist/core/extensions/types.d.ts` and `docs/extensions.md`: `registerCommand` accepts only `description`, optional `getArgumentCompletions`, and `handler`. For flag-completion behavior, use `getArgumentCompletions(prefix)` instead. Do not implement from the code block as-is.

---

## 3. Reusable Design Patterns

### 3.1 Slash Command UX

**Best pattern from research (repo-scaffold):**
```
/onboard              → full analysis and generation
/onboard --dry-run    → preview without writing files
/onboard --force      → overwrite existing files (with confirmation)
```

**Draft behavior pattern (agentsgen + consensus):**
```
If AGENTS.md exists AND no marker-boundary found: write AGENTS.pi-onboard.draft.md
If AGENTS.md exists WITH markers: update only marked sections
If AGENTS.md does not exist: create it
```

**Completion summary pattern (design doc + research):**
```
pi-onboard complete.
Created:
  - /repo/AGENTS.md
  - /repo/pi-onboard-overview.html

Confidence:
  - Tech stack: high (package.json + pyproject.toml)
  - Test command: medium (jest found in devDependencies, but no test script)
  - Lint command: low (no lint config found)
```

### 3.2 Repo Inspection Flow (Discovery Layer)

**File priority order (synthesized from davidcjw + mitosis + repo-radar):**

1. README files (first 500 chars for purpose detection)
2. Package manifests (package.json, pyproject.toml, Cargo.toml, go.mod, gemfile)
3. CI configs (.github/workflows/, .gitlab-ci.yml, Jenkinsfile)
4. Lint/formatter configs (.eslintrc*, .prettierrc*, ruff.toml, gofmt)
5. Test configs (jest.config*, pytest.ini, vitest.config*)
6. Makefile (common commands)
7. Dockerfile / docker-compose.yml (infrastructure hints)
8. Existing AGENTS.md / CLAUDE.md (for merge/draft logic)
9. Top-level directory structure (depth 1-2, ignore generated dirs)

**Ignore set (from repo-radar + common sense):**
```
.git, node_modules, dist, build, .next, .turbo, .venv,
.venv, env, __pycache__, .cache, target, vendor, .bundle,
.terraform, .serverless, coverage, .nyc_output
```

### 3.3 AGENTS.md Structure (Best Combined Template)

Synthesized from agents-md-gen + davidcjw + markoblogo + DESIGN.md:

```markdown
# AGENTS.md

> Auto-generated by pi-onboard. Review before committing.

## Project Overview
- **Name:** {repo-name}
- **Purpose:** {inferred from README + manifests}
- **Stack:** {languages + frameworks detected}
- **Confidence:** {high/medium/low}

## Important Paths
- `src/` — main application code
- `tests/` — test suite (vitest)
- `docs/` — architecture documentation
- `scripts/` — utility scripts

## Commands
- **Run** (`npm run dev`): starts dev server
- **Test** (`npm test`): runs vitest [confidence: high]
- **Lint** (`npm run lint`): runs eslint [confidence: medium]
- **Build** (`npm run build`): TypeScript compilation

## Working Conventions
- TypeScript throughout; strict mode enabled
- Prefer named exports over default exports
- Tests required for all new utility functions

## Where to Start
1. Read `README.md` for project overview
2. Explore `src/` for core logic
3. Check `tests/` for test patterns

## Open Uncertainties
- No deployment config found — likely deployed via Docker
- Lint command inferred from eslint config but no npm script
```

**Key quality rules from research:**
- Every section must have evidence or be labeled as inferred
- Prefer bullets over prose (harness consumption, not human blog post)
- Hard cap at ~150-200 lines (from davidcjw, confirmed by design doc)
- Leave "Open Uncertainties" section as honesty mechanism (from DESIGN.md)

### 3.4 HTML Report Layout

**Synthesized from ai-repo-adventures + DESIGN.md + best practices:**

```
┌──────────────────────────────────────────────────────┐
│  pi-onboard overview: repo-name                      │
│  ────────────────────────────────────────             │
│  Purpose: ...   Stack: ...   Confidence: high         │
├──────────────────────────────────────────────────────┤
│  📁 Repo Structure (collapsible tree)                 │
│  ├── src/        Main application code                │
│  ├── tests/      Test suite                           │
│  └── docs/       Documentation                        │
├──────────────────────────────────────────────────────┤
│  ⚡ Commands (confidence badges)                      │
│  Run: npm run dev [high]   Test: npm test [high]      │
│  Lint: npm run lint [med]  Build: npm run build [high]│
├──────────────────────────────────────────────────────┤
│  📋 Conventions & Gotchas                             │
│  - TypeScript strict mode                             │
│  - Avoid touching auth middleware without review       │
├──────────────────────────────────────────────────────┤
│  📖 Next Steps                                        │
│  - Read src/index.ts first                            │
│  - Check README.md for setup guide                    │
└──────────────────────────────────────────────────────┘
```

**HTML design constraints from research:**
- Single-file: embed CSS + minimal JS (from ai-repo-adventures, confirmed by DESIGN.md)
- Dark theme (from DESIGN.md)
- Collapsible sections (from ai-repo-adventures)
- Interactive but no framework (vanilla JS only)
- Confidence badges (color-coded: green=high, yellow=medium, red=low)

### 3.5 Safe File Behavior

**Consensus pattern (agentsgen + markoblogo + DESIGN.md):**

| Scenario | Behavior |
|----------|----------|
| AGENTS.md doesn't exist | Create it |
| AGENTS.md exists, no `/onboard` markers | Write `AGENTS.pi-onboard.draft.md` |
| AGENTS.md exists with markers | Update marked sections only |
| HTML overview doesn't exist | Create it |
| HTML overview exists (pi-onboard generated) | Overwrite (if forced) or draft |
| HTML overview exists (not pi-onboard) | Write `pi-onboard-overview.draft.html` |

### 3.6 Confidence Model

Synthesized from design doc + agents-md-gen's fallback patterns:

| Signal | Confidence |
|--------|------------|
| Script found in package.json `scripts` | high |
| Binary detected on PATH (e.g., jest, pytest) | medium |
| Config file detected but no npm script (e.g., jest.config.js) | medium |
| Common pattern guessed (e.g., "probably `cargo test`") | low |
| No evidence found | suppress |

---

## 4. Recommendations for pi-onboard MVP

### 4.1 Output File Names (Keep as designed)

- `AGENTS.md` (or `AGENTS.pi-onboard.draft.md` if exists)
- `pi-onboard-overview.html` (or `.draft.html` if exists)

### 4.2 HTML Layout Priorities

1. **Structure/repo map first** — per DESIGN.md, this should be prominent early in the page
2. Summary card (name, purpose, stack, confidence)
3. Commands with confidence badges
4. Conventions/gotchas
5. Next steps / first-read suggestions

Single-file HTML with:
- Embedded CSS (dark theme)
- Minimal vanilla JS for collapsible sections
- No external dependencies (not even a CDN font — inline or use system fonts)

### 4.3 File Safety Behavior

Follow the table in §3.5. Key decisions:
- **Draft by default** when AGENTS.md already exists
- **Overwrite HTML only if forced** (`--force` flag) or if previously generated by pi-onboard
- Detect "previously generated by pi-onboard" via a HTML comment marker: `<!-- generated by pi-onboard -->`

### 4.4 Inference Heuristics

**For MVP, use these detection strategies (no LLM):**

| What | How |
|------|-----|
| Project purpose | README first sentence, package.json `description`, repo name |
| Primary language | Extension-based voting (.ts, .js, .py, .rs counts) |
| Framework | package.json dependencies, pyproject.toml, Cargo.toml |
| Run command | `scripts.start`, `scripts.dev`, Procfile, Makefile, `docker-compose up` |
| Test command | `scripts.test`, jest/pytest config, Makefile test target |
| Lint command | `scripts.lint`, eslint/ruff config, Makefile lint target |
| Build command | `scripts.build`, Makefile build, Dockerfile |
| Important dirs | Known names: src, app, lib, tests, docs, api, cmd, pkg |

**Confidence assignment:**
- **high**: directly from package.json/pyproject.toml `scripts` or `Makefile`
- **medium**: from config file presence (jest.config.js → "npm test" likely)
- **low**: from git history or common patterns (husky detected → lint likely)
- **suppress**: no signal at all

### 4.5 Architecture Decision: Monolithic Slash Command

For MVP, keep `/onboard` as a **single monolithic command** (not a multi-step guided flow).

Rationale from research:
- cc-rig's 2-question flow is for full project setup (out of scope)
- repo-scaffold's flags (`--dry-run`, `--force`) are better than interactive mode for a Pi terminal
- One-shot commands are the norm in Pi ecosystem (pi-fallow, pi-code-mode, pi-grepai)

**Recommended `/onboard` flags for MVP:**
```
/onboard                    # full analysis, safe write
/onboard --dry-run          # preview only, no files written
/onboard --force            # overwrite existing files
/onboard --text-only        # skip HTML generation
/onboard --help             # show usage
```

### 4.6 What to Defer Until Later

From research analysis:

- **Interactive guided mode** (cc-rig style Q&A) — unnecessary complexity for MVP
- **LLM-enhanced sections** — add as optional enhancement post-MVP
- **Multi-output formats** (CLAUDE.md, cursor-rules) — add when requested
- **Watch mode / auto-update** — complex, deferred by design doc
- **MCP server** (like agentsgen/repo-seatbelt offer) — out of scope for a Pi extension
- **Full dependency graph visualization** — beyond MVP scope
- **Multi-repo support** — one repo at a time
- **Private repo tokens** — Pi runs locally, already has access

---

## 5. Appendix: Additional Candidates

### Weaker or Indirectly Relevant

| Project | Notes |
|---------|-------|
| ForgeSeed | Starter kit with AGENTS.md template. Template structure is useful but the tool itself is Windows-focused. |
| agentmd-scout | Python AGENTS.md generator. No source code available (empty repo essentially). |
| Lilchris007/AGENTS.md_generator | Fork of markoblogo. No additional value. |
| Noshitha/agents-md-generator | Research project evaluating AGENTS.md efficacy. Interesting methodology paper but not an implementable tool. |
| jhm-shojib/agentmd-scout | Empty repo (5KB, no source). Ignore. |
| Darkstar420/patchmind | Git patch → HTML reports. Interesting single-file HTML approach but focused on patches, not onboarding. |
| gorkalertxundi/junit-report-generator | JUnit → HTML reports. Single-file HTML approach worth glancing at for implementation patterns. |

### Research Papers / Theoretical (Mentioned by markoblogo)

- **"Do Context Files Help?"** (ETH Zurich) — finds auto-generated context can reduce agent performance. Cited by agentsgen's manifesto. Implication: pi-onboard should err toward minimal, verified context over verbose generation.
- **"Codified Context"** — argues for layered, evolving context over a single file. Implication: pi-onboard's AGENTS.md should be self-contained for MVP but designed to support future layered expansion.

---

## Quick Reference: What to Steal for Each pi-onboard Layer

| pi-onboard Layer | Steal from | Exact thing to steal |
|-----------------|------------|---------------------|
| **Discovery** | mitosisdev/agents-md-gen | `RepoContext` interface + `scanRepo()` function pattern |
| **Discovery** | repo-radar | Zero-dependency file walker + ignore set |
| **Synthesis** | davidcjw/agents-md-generator | Evidence-based section generation (only emit sections with data) |
| **Synthesis** | DESIGN.md | Confidence model (high/medium/low) |
| **AGENTS.md Gen** | mitosisdev/agents-md-gen | Section-by-section template with fallback text |
| **AGENTS.md Gen** | markoblogo/agentsgen | Marker-based section boundaries for safe partial updates |
| **HTML Gen** | ai-repo-adventures | Self-contained HTML with inline CSS/JS, dark theme, collapsible layout |
| **HTML Gen** | DESIGN.md | Structure/repo map prominent early in page |
| **Slash Command** | pi-fallow | `pi.registerCommand()` exact pattern |
| **Slash Command** | repo-scaffold | `--dry-run`, `--force` flags |
| **File Safety** | markoblogo/agentsgen | Draft file naming (`*.draft.md`) when target exists |
