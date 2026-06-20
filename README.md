# pi-onboard

> **Status: design stage.** The `/onboard` extension is not yet implemented. This
> repository currently holds the design and research docs ([`docs/`](./docs)).
> The install commands below describe the intended release. Star/watch if you
> want the first cut.

A [Pi](https://pi.dev) extension for onboarding into an unfamiliar repository.
Run `/onboard` and pi-onboard inspects the repo, infers what it is and how it's
built, and writes durable orientation artifacts you (and future coding-agent
sessions) can actually use.

## What it produces

Two artifacts in the repo root:

- **`AGENTS.md`** — a lean, confidence-aware context file for future harness
  sessions. Hand-edits are never clobbered: pi-onboard updates only its own
  marker-bounded sections, or writes a `AGENTS.pi-onboard.draft.md` if the file
  was authored by hand.
- **`pi-onboard-overview.html`** — a single-file, dark, interactive visual
  overview (repo map, commands with confidence badges, conventions, where to
  start). It is also served over HTTP so you can open it from a browser on
  another machine.

## Install

```bash
# from npm (once released)
pi install npm:@nathanpt/pi-onboard

# from git
pi install git:github.com/nathanpt/pi-onboard

# try without installing
pi -e npm:@nathanpt/pi-onboard
```

## Usage

```text
/onboard                    # full analysis, safe write
/onboard --dry-run          # preview output, write nothing
/onboard --force            # overwrite existing files
/onboard --text-only        # skip the HTML overview (and the server)
/onboard --no-serve         # write the HTML file but don't start a server
/onboard --port 4321        # pin a server port (default: OS-assigned)
/onboard --host 127.0.0.1   # bind address (default: 0.0.0.0)
/onboard --idle-timeout 60  # server idle shutdown, minutes (default: 30)
/onboard --yes              # skip the preference interview, use defaults
/onboard --help             # show usage
```

### Adaptive preference interview

When the host session provides an `ask_user_question`-style tool, pi-onboard
asks a short set of questions before generating — most importantly the
**detail level** (concise / balanced / detailed), since overlong context files
are known to degrade agent performance. When the tool is absent, it falls back
to defaults and never blocks. Pass `--yes` to skip it.

## How it works

- **Static-first.** All inference comes from repo file signals
  (`package.json`, `pyproject.toml`, `Makefile`, CI configs, etc.). No LLM is
  used for discovery or generation — only optionally for the preference
  interview.
- **Confidence-aware.** Every inferred command carries a confidence level
  (high / medium / low); guesses with no supporting signal are suppressed.
- **Safe by default.** Existing files are never silently overwritten.
- **Node/TypeScript and Python first.** Other ecosystems are best-effort.

## Security note

The overview server binds to `0.0.0.0` by default so it's reachable from remote
machines (SSH sessions, dev boxes, CI runners behind a tunnel). It serves only
the generated overview (repo-derived paths/commands/conventions — not arbitrary
file access), auto-stops after 30 min idle, and lives behind an unguessable URL
token. Use `--host 127.0.0.1` for local-only access. pi-onboard makes **no
outbound network calls**; the HTTP server is the only network surface.

## Docs

- [`docs/DESIGN.md`](./docs/DESIGN.md) — full design.
- [`docs/RESEARCH_FINDINGS.md`](./docs/RESEARCH_FINDINGS.md) — survey of similar
  tools and the patterns adopted.
