/**
 * Shared types for pi-onboard.
 */

/** A top-level or known-important directory with an explanation. */
export interface DirEntry {
  name: string;
  description?: string;
}

/**
 * Raw repo signals collected by the discovery layer.
 * Everything here is directly observed — no inference.
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
}
