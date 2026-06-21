# pi-onboard

A [Pi](https://pi.dev) extension for onboarding into an unfamiliar repository.

Run `/onboard` and pi-onboard does a quick static discovery pass, then fills
your editor with a structured prompt. Press **Enter** and the agent reads your
source files, understands the project, and writes durable orientation artifacts
you (and future coding-agent sessions) can actually use.

## What it produces

Two artifacts in the repo root:

- **`AGENTS.md`** — a clean, practical context file for future harness sessions.
  Safe by default: if `AGENTS.md` already exists, a `.draft` variant is created
  instead of clobbering your work.
- **`pi-onboard-overview.html`** — a single-file, dark, interactive visual
  overview (repo map, commands, conventions, where to start). Served over HTTP
  so you can open it from a browser on another machine.

## Install

```bash
# from npm
pi install npm:@nathanpt/pi-onboard

# from git
pi install git:github.com/nathanpt/pi-onboard

# try without installing
pi -e npm:@nathanpt/pi-onboard
```

## Usage

```text
/onboard                    # full analysis, safe write
/onboard --force            # overwrite existing files
/onboard --text-only        # skip the HTML overview (and the server)
/onboard --no-serve         # write the HTML file but don't start a server
/onboard --port 4321        # pin a server port (default: OS-assigned)
/onboard --host 127.0.0.1   # bind address (default: 0.0.0.0)
/onboard --idle-timeout 60  # server idle shutdown, minutes (default: 30)
/onboard --help             # show usage
```

After running `/onboard`, a structured prompt appears in your editor. Press
**Enter** to let the agent analyze the repo and generate the files.

## How it works

1. **Discovery** — scans package manifests, README, CI configs, and directory
   structure to gather repo signals.
2. **Server** — starts an HTTP server (unless `--no-serve`) so the HTML
   overview is immediately reachable from any browser on your network.
3. **Prompt** — fills your editor with the discovery context and instructions.
   Press Enter and the agent reads your actual source files, understands the
   project, and writes both artifacts.

**Safe by default** — existing files are never silently overwritten; a `.draft`
variant is created instead. Use `--force` to overwrite in place.

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

## License

MIT © [Nathan Peet](https://github.com/nathanpt). See [LICENSE](./LICENSE).
