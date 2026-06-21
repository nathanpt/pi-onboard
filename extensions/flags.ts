/**
 * Flag parsing and completions for /onboard.
 */
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { Options } from "./types.ts";

interface FlagDef {
  name: string;
  takesValue: boolean;
  description: string;
}

const FLAGS: FlagDef[] = [
  { name: "--force", takesValue: false, description: "Overwrite existing files (bypass draft behavior)" },
  { name: "--text-only", takesValue: false, description: "Skip HTML overview generation (implies --no-serve)" },
  { name: "--no-serve", takesValue: false, description: "Write the HTML file but do not start a server" },
  { name: "--port", takesValue: true, description: "Pin a server port (default: OS-assigned ephemeral)" },
  { name: "--host", takesValue: true, description: "Bind address (default: 0.0.0.0; use 127.0.0.1 for local only)" },
  { name: "--idle-timeout", takesValue: true, description: "Server idle shutdown in minutes (default: 30; 0 = never)" },
  { name: "--help", takesValue: false, description: "Show usage" },
];

export const USAGE = `\
/onboard — inspect a repo and generate onboarding artifacts.

Usage:
  /onboard [options]

Options:
${FLAGS.map((f) => `  ${f.name.padEnd(18)} ${f.description}`).join("\n")}

The command fills your editor with a structured prompt. Press Enter to
let the agent analyze the repo and write:
  AGENTS.md                    Durable context file for future sessions
  pi-onboard-overview.html     Visual repo overview (served over HTTP)`;

export function parseArgs(args: string): Options | null {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const options: Options = {
    force: false,
    textOnly: false,
    noServe: false,
    host: "0.0.0.0",
    idleTimeout: 30,
  };
  const warnings: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const def = FLAGS.find((f) => f.name === tok);

    if (!def) {
      warnings.push(`unknown flag: ${tok} (ignored)`);
      continue;
    }

    if (def.name === "--help") return null;
    if (def.name === "--force") options.force = true;
    else if (def.name === "--text-only") options.textOnly = true;
    else if (def.name === "--no-serve") options.noServe = true;
    else if (def.name === "--port") {
      const val = tokens[++i];
      const n = Number(val);
      if (!val || Number.isNaN(n)) {
        warnings.push("--port requires a number; using OS-assigned");
      } else {
        options.port = n;
      }
    } else if (def.name === "--host") {
      const val = tokens[++i];
      if (!val) {
        warnings.push("--host requires an address; using 0.0.0.0");
      } else {
        options.host = val;
      }
    } else if (def.name === "--idle-timeout") {
      const val = tokens[++i];
      const n = Number(val);
      if (!val || Number.isNaN(n)) {
        warnings.push("--idle-timeout requires a number; using default 30");
      } else {
        options.idleTimeout = n;
      }
    }
  }

  if (options.textOnly) options.noServe = true;
  (options as Options & { warnings?: string[] }).warnings = warnings;
  return options;
}

export function getArgumentCompletions(prefix: string): AutocompleteItem[] {
  if (!prefix.startsWith("-")) return [];
  return FLAGS.filter((f) => f.name.startsWith(prefix)).map((f) => ({
    value: f.takesValue ? `${f.name} ` : f.name,
    label: f.name,
    description: f.description,
  }));
}
