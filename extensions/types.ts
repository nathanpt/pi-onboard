/**
 * Shared types for pi-onboard.
 *
 * The data flows discovery → synthesis → artifacts:
 *   discover(cwd): RepoContext        (raw signals)
 *   synthesize(ctx): Analysis          (inferred understanding)
 *   generateAgentsMd(html)(analysis)   (durable artifacts)
 */

/** Confidence level for an inferred value. */
export type Confidence = "high" | "medium" | "low";

/** An inferred command (run/test/lint/build) with its evidence and confidence. */
export interface Command {
  /** Category label: "Run", "Test", "Lint", "Build", etc. */
  label: string;
  /** The command string, e.g. "npm test". */
  command: string;
  confidence: Confidence;
  /** What file/signal supported this inference, e.g. "package.json scripts.test". */
  evidence: string;
}

/** A top-level or known-important directory with an explanation. */
export interface DirEntry {
  name: string;
  description?: string;
}

/**
 * Raw repo signals collected by the discovery layer.
 * Everything here is directly observed — no inference yet.
 */
export interface RepoContext {
  /** Absolute path of the inspected directory. */
  cwd: string;
  /** Repo/dir name (derived from path). */
  name: string;
  /** package.json description, pyproject description, etc. */
  description?: string;
  /** First ~500 chars of README, if present. */
  readmeSummary?: string;
  /** File-extension vote counts, sorted descending, e.g. [{ext:".ts",count:42}]. */
  languages: { ext: string; count: number }[];
  /** Detected runtime, e.g. "node", "python". */
  runtime?: string;
  /** Raw scripts map (package.json scripts, Makefile targets). */
  scripts?: Record<string, string>;
  /** Runtime dependency names (keys only). */
  dependencies?: string[];
  /** Dev dependency names (keys only). */
  devDependencies?: string[];
  /** Top-level directories (depth 1, ignore-set filtered). */
  topDirs: DirEntry[];
  /** High-signal files found (manifests, configs, CI files). */
  importantFiles: string[];
  /** Whether an existing AGENTS.md / CLAUDE.md / context file is present. */
  hasExistingContext: boolean;
}

/** A language/framework detected in the repo. */
export interface StackEntry {
  name: string;
  confidence: Confidence;
}

/** The synthesized understanding of the repo. */
export interface Analysis {
  name: string;
  purpose: string;
  purposeConfidence: Confidence;
  stack: StackEntry[];
  commands: Command[];
  importantDirs: DirEntry[];
  conventions: string[];
  /** Honest notes about what could not be determined. */
  uncertainties: string[];
  /** Suggested first files to read. */
  startingPoints: string[];
}

/** User preferences (from interview or defaults). */
export interface Preferences {
  detail: "concise" | "balanced" | "detailed";
  /** Minimum confidence for commands to appear in output. */
  floor: Confidence;
  /** Whether to emit the HTML overview. */
  html: boolean;
  /** Section ids to include. */
  sections: string[];
}

/** Parsed command-line options. */
export interface Options {
  dryRun: boolean;
  force: boolean;
  textOnly: boolean;
  noServe: boolean;
  /** Pinned port; undefined = OS-assigned ephemeral. */
  port?: number;
  /** Bind address. Default "0.0.0.0". */
  host: string;
  /** Server idle shutdown in minutes; 0 = never. */
  idleTimeout: number;
  /** Skip the preference interview. */
  yes: boolean;
}

/** Default preferences (used when interview is absent, skipped, or fails). */
export const DEFAULT_PREFERENCES: Preferences = {
  detail: "balanced",
  floor: "medium",
  html: true,
  sections: ["purpose", "stack", "paths", "commands", "conventions", "where-to-start", "uncertainties"],
};
