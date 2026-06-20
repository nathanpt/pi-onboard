# pi-onboard Research Handoff Brief

## Mission

Research existing GitHub projects, extensions, tools, prompts, and workflows that overlap with the `pi-onboard` concept before implementation begins.

The goal is **not** to find something to install blindly. The goal is to learn from what already exists so `pi-onboard` can copy the best ideas, avoid obvious mistakes, and choose a lean MVP.

## Project Context

`pi-onboard` is a proposed Pi extension centered on repository onboarding.

Current design direction:
- primary slash command: `/onboard`
- default behavior: inspect the current repo and generate durable onboarding artifacts
- primary outputs:
  - `AGENTS.md`
  - `pi-onboard-overview.html`
- file safety: draft by default if `AGENTS.md` already exists
- UX emphasis: balanced overview, but with structure/repo map prominently surfaced early
- philosophy: lean, useful, confidence-aware, safe, and artifact-oriented

This is **not** meant to be a giant repo analysis platform. The MVP should stay lightweight and practical.

## Research Goals

Find and analyze examples that help answer:

1. How do similar tools handle **repo onboarding**?
2. How do similar tools generate or maintain **`AGENTS.md` / `CLAUDE.md` / repo instruction files**?
3. Are there existing tools that generate a **visual repo overview**, especially as a self-contained HTML artifact?
4. What command UX patterns are best for a repo-entry command like `/onboard`?
5. What heuristics do similar tools use to infer:
   - project purpose
   - tech stack
   - important folders
   - run/test/lint/build commands
6. What safety behavior is common when generated artifacts already exist?
7. Which existing approaches are lightweight and reusable versus bloated or overengineered?

## Research Scope

Prioritize these categories:

### 1. Repo onboarding / repo understanding tools
Look for projects that:
- analyze a repo and summarize it
- produce onboarding docs
- create developer context files
- help an AI or human ramp into a new repository quickly

### 2. AGENTS.md / CLAUDE.md / instruction-file generators
Look for projects, prompts, extensions, or scripts that:
- generate `AGENTS.md`
- generate `CLAUDE.md`
- generate repo instruction docs for AI coding tools
- update existing instruction files safely

### 3. Repo visualization outputs
Look for tools that create:
- self-contained HTML summaries
- repo maps
- architecture overviews
- interactive static reports
- tree or structure visualizations useful for onboarding

### 4. Pi-specific and adjacent harness ecosystems
Look for examples from:
- Pi extensions
- Claude Code ecosystem
- Codex/Cline/OpenCode/Hermes-adjacent tooling
- repo bootstrap or context-generation utilities

### 5. Prompt- or workflow-based analogs
Even if something is not packaged as code, it may still be useful if it provides:
- strong onboarding prompts
- repo summarization workflows
- agent bootstrap patterns
- repeatable repo reconnaissance loops

## What to Collect for Each Candidate

For every meaningful candidate, capture:

- **name**
- **URL**
- **category**
- **short description**
- **what overlap it has with `pi-onboard`**
- **best ideas worth copying**
- **what to avoid copying**
- **implementation clues**
- **maturity / signal level**

If available, also capture:
- command UX
- output examples
- screenshot or HTML/report style notes
- whether it writes files or just prints output
- how it handles existing files
- how lightweight or dependency-heavy it is

## Evaluation Lens

The most important lens is:

### High-value signals
- creates durable artifacts instead of ephemeral chat output
- produces useful repo understanding quickly
- uses safe file-write behavior
- has a clean and understandable UX
- is lightweight enough for Pi
- has implementation ideas that can realistically be adapted

### Lower-value signals
- vague AI wrapper projects
- giant all-in-one agent frameworks
- flashy repo analysis with no durable outputs
- tools that depend on lots of infrastructure for a simple result
- anything that solves a much bigger problem than the MVP actually needs

## Specific Research Questions to Answer

### Command and UX
- Is `/onboard` the right command name, based on analogous tools?
- Do similar tools prefer one-shot commands, guided flows, or multi-step modes?
- What should the completion summary look like?

### `AGENTS.md` generation
- What sections are common in good AI-facing repo instruction files?
- How do good generators express uncertainty without hallucinating certainty?
- How do they safely handle pre-existing files?

### HTML report design
- Are there existing repo-summary HTML pages worth learning from?
- Which layouts best support quick repo understanding?
- What structure/map treatment seems most useful?
- Can the HTML be single-file and still feel polished?

### Repo inference heuristics
- What files do similar tools inspect first?
- How do they infer run/test/lint/build commands?
- How do they identify important folders without dumping the whole tree?

### Safety and trust
- What draft/update patterns are common?
- What overwrite policies are acceptable?
- How much confidence labeling is enough for a first MVP?

## Deliverable Format

Return a concise research memo with these sections:

## 1. Executive summary
- top takeaways
- strongest directions for `pi-onboard`
- biggest traps to avoid

## 2. Best candidate projects
A ranked shortlist of the most relevant examples.

For each candidate, include:
- link
- what it does
- why it matters
- what to copy
- what not to copy

## 3. Reusable design patterns
Summarize patterns worth adopting for:
- slash command UX
- repo inspection flow
- `AGENTS.md` structure
- HTML report layout
- safe draft/update behavior

## 4. Recommendations for `pi-onboard` MVP
Give explicit recommendations on:
- output file names
- HTML layout priorities
- file safety behavior
- inference heuristics
- what to defer until later

## 5. Optional appendix
Include extra links or weaker candidates only if still potentially useful.

## Strong Starting Search Angles

Use search terms like:
- `AGENTS.md generator github`
- `CLAUDE.md generator github`
- `repository onboarding tool github`
- `repo summary html generator github`
- `codebase overview html github`
- `developer onboarding repo analysis github`
- `repo context generator ai github`
- `Pi extension slash command github`
- `agent bootstrap repository prompt github`
- `repo map html visualization github`

Also search within known harness ecosystems for repo-context and repo-bootstrap behaviors.

## Constraints

- Favor real GitHub projects or concrete public artifacts over generic blog commentary.
- Prefer lightweight, inspectable implementations.
- Do not recommend giant frameworks unless a specific sub-idea is genuinely worth extracting.
- Keep the research tied to the actual MVP instead of broad AI-agent theory.

## Current Working MVP Summary

Use this as the baseline when judging candidates:

- command: `/onboard`
- outputs:
  - `AGENTS.md`
  - `pi-onboard-overview.html`
- HTML style: dark, interactive, single-file, structure-prominent, visually clean
- behavior: inspect repo, infer stack/purpose/important paths/commands, then generate artifacts
- safety: draft by default when `AGENTS.md` already exists
- target quality bar: useful enough to keep and use on the next repo session

## Decision Standard

The final research output should make implementation easier.

A good result does **not** just list projects.
A good result tells us:
- which ideas are worth stealing,
- which approaches are too heavy,
- what the MVP should look like,
- and how to avoid wasting time building obvious dead ends.
