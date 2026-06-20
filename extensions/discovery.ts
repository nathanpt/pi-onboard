/**
 * Discovery layer — collect raw repo signals.
 *
 * Walks the repo, reads high-signal files, and assembles a RepoContext.
 * Everything here is directly observed; no inference happens yet.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { basename, join, extname } from "node:path";
import type { DirEntry, RepoContext } from "./types.ts";

/** Directories to never descend into or count. */
const IGNORE_DIRS = new Set([
  ".git", "node_modules", "dist", "build", ".next", ".turbo", ".venv",
  "env", "__pycache__", ".cache", "target", "vendor", ".bundle",
  ".terraform", ".serverless", "coverage", ".nyc_output", ".svelte-kit",
  ".gradle", "out", ".idea", ".vscode",
]);

/** Known-important directory names and their explanations. */
const KNOWN_DIRS: Record<string, string> = {
  src: "Main application source code",
  app: "Application code (entry points, routes)",
  lib: "Shared library code",
  test: "Test suite",
  tests: "Test suite",
  __tests__: "Test suite",
  spec: "Test specifications",
  docs: "Documentation",
  doc: "Documentation",
  scripts: "Utility and build scripts",
  cmd: "Command-line entry points (Go)",
  pkg: "Public packages (Go)",
  api: "API handlers / definitions",
  config: "Configuration files",
  public: "Static public assets",
  static: "Static assets",
  assets: "Static assets",
  components: "UI components",
  pages: "Page components",
  routes: "Route definitions",
  services: "Service-layer code",
  models: "Data models",
  types: "TypeScript type definitions",
  utils: "Utility functions",
  hooks: "React/custom hooks",
  db: "Database schemas/migrations",
  migrations: "Database migrations",
  prisma: "Prisma schema and client",
};

/** Extensions to count for language voting. */
const COUNTED_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rs", ".go", ".java", ".kt", ".rb", ".php",
  ".swift", ".c", ".cpp", ".h", ".hpp", ".cs",
  ".vue", ".svelte", ".astro",
  ".sh", ".bash", ".zsh",
  ".css", ".scss", ".less",
  ".html", ".htm",
  ".json", ".yaml", ".yml", ".toml", ".xml",
  ".sql",
]);

/**
 * Discover repo signals from the given directory.
 * Every file read is guarded — missing/unreadable files are silently skipped.
 */
export function discover(cwd: string): RepoContext {
  const name = basename(cwd);
  const topDirs: DirEntry[] = [];
  const importantFiles: string[] = [];
  const langCounts = new Map<string, number>();

  // --- Walk depth-1 for directories + file counts ---
  let topEntries: string[] = [];
  try {
    topEntries = readdirSync(cwd);
  } catch {
    topEntries = [];
  }

  for (const entry of topEntries) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(cwd, entry);
    try {
      const st = statSync(full);
      if (st.isDirectory()) {
        topDirs.push({
          name: entry,
          description: KNOWN_DIRS[entry],
        });
        // Count files one level deeper for language voting
        try {
          for (const child of readdirSync(full)) {
            if (IGNORE_DIRS.has(child)) continue;
            const ext = extname(child).toLowerCase();
            if (COUNTED_EXTS.has(ext)) {
              langCounts.set(ext, (langCounts.get(ext) ?? 0) + 1);
            }
          }
        } catch {
          // skip unreadable subdirs
        }
      } else if (st.isFile()) {
        const ext = extname(entry).toLowerCase();
        if (COUNTED_EXTS.has(ext)) {
          langCounts.set(ext, (langCounts.get(ext) ?? 0) + 1);
        }
      }
    } catch {
      // stat failed — skip
    }
  }

  // --- Read high-signal files ---
  const { description, scripts, dependencies, devDependencies, runtime } = readManifests(cwd, importantFiles);
  const readmeSummary = readReadme(cwd, importantFiles);
  const hasExistingContext = checkExistingContext(cwd, importantFiles);
  readConfigFiles(cwd, importantFiles);

  // Sort languages by count descending
  const languages = [...langCounts.entries()]
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count);

  return {
    cwd,
    name,
    description,
    readmeSummary,
    languages,
    runtime,
    scripts,
    dependencies,
    devDependencies,
    topDirs,
    importantFiles,
    hasExistingContext,
  };
}

// ---------------------------------------------------------------------------
// File readers
// ---------------------------------------------------------------------------

function tryRead(file: string): string | undefined {
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return undefined;
  }
}

/** Read package.json / pyproject.toml / Cargo.toml / go.mod and extract signals. */
function readManifests(
  cwd: string,
  importantFiles: string[],
): {
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: string[];
  devDependencies?: string[];
  runtime?: string;
} {
  // --- package.json (Node) ---
  const pkgPath = join(cwd, "package.json");
  const pkgRaw = tryRead(pkgPath);
  if (pkgRaw) {
    importantFiles.push("package.json");
    try {
      const pkg = JSON.parse(pkgRaw);
      return {
        description: pkg.description,
        scripts: pkg.scripts,
        dependencies: pkg.dependencies ? Object.keys(pkg.dependencies) : [],
        devDependencies: pkg.devDependencies ? Object.keys(pkg.devDependencies) : [],
        runtime: "node",
      };
    } catch {
      // malformed JSON — fall through
    }
  }

  // --- pyproject.toml (Python) ---
  const pyPath = join(cwd, "pyproject.toml");
  const pyRaw = tryRead(pyPath);
  if (pyRaw) {
    importantFiles.push("pyproject.toml");
    const description = extractTomlValue(pyRaw, "description");
    return {
      description,
      runtime: "python",
    };
  }

  // --- requirements.txt (Python fallback) ---
  if (existsSync(join(cwd, "requirements.txt"))) {
    importantFiles.push("requirements.txt");
    return { runtime: "python" };
  }

  // --- Cargo.toml (Rust) ---
  if (tryRead(join(cwd, "Cargo.toml"))) {
    importantFiles.push("Cargo.toml");
    return { runtime: "rust" };
  }

  // --- go.mod (Go) ---
  if (tryRead(join(cwd, "go.mod"))) {
    importantFiles.push("go.mod");
    return { runtime: "go" };
  }

  return {};
}

/** Read README (first ~500 chars) for purpose detection. */
function readReadme(cwd: string, importantFiles: string[]): string | undefined {
  for (const name of ["README.md", "README.MD", "README.rst", "README.txt", "README"]) {
    const raw = tryRead(join(cwd, name));
    if (raw) {
      importantFiles.push(name);
      return raw.slice(0, 500).trim();
    }
  }
  return undefined;
}

/** Check for existing AGENTS.md / CLAUDE.md / context files. */
function checkExistingContext(cwd: string, importantFiles: string[]): boolean {
  const contextFiles = ["AGENTS.md", "CLAUDE.md", ".cursorrules", ".cursor/rules"];
  let found = false;
  for (const name of contextFiles) {
    if (existsSync(join(cwd, name))) {
      importantFiles.push(name);
      found = true;
    }
  }
  return found;
}

/** Detect config files that provide additional signals. */
function readConfigFiles(cwd: string, importantFiles: string[]): void {
  const configs = [
    "Makefile",
    "tsconfig.json",
    "jest.config.js", "jest.config.ts", "vitest.config.ts", "vitest.config.js",
    ".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.cjs",
    "eslint.config.js", "eslint.config.mjs",
    ".prettierrc", ".prettierrc.js", ".prettierrc.json",
    "ruff.toml", ".flake8",
    "pytest.ini", "tox.ini",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    ".github/workflows",
  ];
  for (const name of configs) {
    if (existsSync(join(cwd, name))) {
      importantFiles.push(name);
    }
  }
}

/** Naive TOML value extractor for simple `key = "value"` lines. */
function extractTomlValue(toml: string, key: string): string | undefined {
  const match = toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"));
  return match?.[1];
}
