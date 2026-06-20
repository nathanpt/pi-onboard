/**
 * Synthesis layer — turn raw repo signals into structured understanding.
 *
 * Takes a RepoContext (directly observed data) and produces an Analysis
 * (inferred purpose, stack, commands, conventions). All inference is
 * static — no LLM. Confidence is assigned per the DESIGN.md Confidence Model.
 */
import type {
  Analysis,
  Command,
  Confidence,
  RepoContext,
  StackEntry,
} from "./types.ts";

/** Confidence rank for comparisons (higher = more certain). */
const CONF_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

/** Framework detection from dependency names. */
const FRAMEWORK_HINTS: Record<string, string> = {
  react: "React", "react-dom": "React", next: "Next.js", vue: "Vue",
  svelte: "Svelte", "@sveltejs/kit": "SvelteKit", astro: "Astro",
  express: "Express", fastify: "Fastify", "@hono/hono": "Hono",
  nestjs: "NestJS", "@nestjs/core": "NestJS",
  fastapi: "FastAPI", flask: "Flask", django: "Django",
  actix: "Actix Web", axum: "Axum", rocket: "Rocket",
  gin: "Gin", echo: "Echo", fiber: "Fiber",
  prisma: "Prisma", drizzle: "Drizzle ORM", mongoose: "Mongoose",
  typeorm: "TypeORM", sequelize: "Sequelize",
  vitest: "Vitest", jest: "Jest", mocha: "Mocha", pytest: "pytest",
  eslint: "ESLint", prettier: "Prettier", ruff: "Ruff",
};

/** Maps package.json script keys to human labels. */
const SCRIPT_LABELS: Record<string, string> = {
  start: "Run", dev: "Run", serve: "Run",
  test: "Test", "test:watch": "Test", "test:e2e": "Test (E2E)",
  lint: "Lint", "lint:fix": "Lint",
  build: "Build", compile: "Build",
  format: "Format", fmt: "Format",
  typecheck: "Typecheck", "type-check": "Typecheck",
  ci: "CI",
};

/** Known lint/test config files that imply a command even without a script. */
const LINT_CONFIGS = [
  ".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.cjs",
  "eslint.config.js", "eslint.config.mjs",
  ".prettierrc", ".prettierrc.js", ".prettierrc.json",
  "ruff.toml", ".flake8",
];

const TEST_CONFIGS = [
  "jest.config.js", "jest.config.ts", "vitest.config.ts", "vitest.config.js",
  "pytest.ini", "tox.ini", "conftest.py",
];

/**
 * Synthesize an Analysis from discovered repo context.
 */
export function synthesize(ctx: RepoContext): Analysis {
  return {
    name: ctx.name,
    purpose: inferPurpose(ctx),
    purposeConfidence: inferPurposeConfidence(ctx),
    stack: inferStack(ctx),
    commands: inferCommands(ctx),
    importantDirs: inferImportantDirs(ctx),
    conventions: inferConventions(ctx),
    uncertainties: inferUncertainties(ctx),
    startingPoints: inferStartingPoints(ctx),
  };
}

// ---------------------------------------------------------------------------
// Purpose
// ---------------------------------------------------------------------------

function inferPurpose(ctx: RepoContext): string {
  // README first line that looks like a description
  if (ctx.readmeSummary) {
    const firstLine = ctx.readmeSummary
      .split("\n")
      .map((l) => l.replace(/^#+\s*/, "").replace(/^>\s*/, "").trim())
      .find((l) =>
        l.length > 10 &&
        !l.startsWith("<!--") &&
        !l.startsWith("![") &&
        !l.startsWith("<") && // skip HTML tags
        !l.startsWith("|") && // skip table rows
        !l.match(/^[-=]{3,}$/), // skip horizontal rules
      );

    if (firstLine) return firstLine;
  }

  // Manifest description
  if (ctx.description) return ctx.description;

  return `${ctx.name} — purpose not detected from repo files.`;
}

function inferPurposeConfidence(ctx: RepoContext): Confidence {
  if (ctx.readmeSummary) return "high";
  if (ctx.description) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------------

function inferStack(ctx: RepoContext): StackEntry[] {
  const stack: StackEntry[] = [];
  const allDeps = [...(ctx.dependencies ?? []), ...(ctx.devDependencies ?? [])];
  const depSet = new Set(allDeps);

  // Primary language by extension vote
  if (ctx.languages.length > 0) {
    const top = ctx.languages[0];
    const langName = extToLanguage(top.ext);
    if (langName) {
      stack.push({
        name: langName,
        confidence: top.count >= 5 ? "high" : "medium",
      });
    }
  }

  // Runtime
  if (ctx.runtime) {
    stack.push({
      name: ctx.runtime === "node" ? "Node.js" : ctx.runtime.charAt(0).toUpperCase() + ctx.runtime.slice(1),
      confidence: "high",
    });
  }

  // Frameworks from dependencies
  for (const dep of allDeps) {
    const framework = FRAMEWORK_HINTS[dep];
    if (framework && !stack.some((s) => s.name === framework)) {
      stack.push({ name: framework, confidence: "high" });
    }
  }

  // TypeScript detection
  if (depSet.has("typescript") || ctx.languages.some((l) => l.ext === ".ts")) {
    if (!stack.some((s) => s.name === "TypeScript")) {
      stack.push({ name: "TypeScript", confidence: "high" });
    }
  }

  return stack;
}

function extToLanguage(ext: string): string | undefined {
  const map: Record<string, string> = {
    ".ts": "TypeScript", ".tsx": "TypeScript (React)",
    ".js": "JavaScript", ".jsx": "JavaScript (React)", ".mjs": "JavaScript", ".cjs": "JavaScript",
    ".py": "Python", ".rs": "Rust", ".go": "Go",
    ".java": "Java", ".kt": "Kotlin", ".rb": "Ruby", ".php": "PHP",
    ".swift": "Swift", ".c": "C", ".cpp": "C++",
    ".vue": "Vue", ".svelte": "Svelte",
  };
  return map[ext];
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function inferCommands(ctx: RepoContext): Command[] {
  const commands: Command[] = [];
  const scripts = ctx.scripts ?? {};

  // From package.json scripts (high confidence)
  for (const [key, value] of Object.entries(scripts)) {
    const label = SCRIPT_LABELS[key];
    if (label) {
      commands.push({
        label,
        command: ctx.runtime === "node" ? `npm run ${key}` : value,
        confidence: "high",
        evidence: `package.json scripts.${key}`,
      });
    } else if (key !== "prepublishOnly" && key !== "prepare") {
      // Other useful scripts
      commands.push({
        label: key,
        command: `npm run ${key}`,
        confidence: "high",
        evidence: `package.json scripts.${key}`,
      });
    }
  }

  // Medium-confidence inferences from config files
  const fileSet = new Set(ctx.importantFiles);

  // Lint from config
  if (!commands.some((c) => c.label === "Lint") && LINT_CONFIGS.some((f) => fileSet.has(f))) {
    const tool = fileSet.has("ruff.toml") || fileSet.has(".flake8") ? "ruff" : "eslint";
    commands.push({
      label: "Lint",
      command: ctx.runtime === "python" ? `${tool} .` : "npx eslint .",
      confidence: "medium",
      evidence: LINT_CONFIGS.find((f) => fileSet.has(f)) ?? "lint config",
    });
  }

  // Test from config
  if (!commands.some((c) => c.label === "Test") && TEST_CONFIGS.some((f) => fileSet.has(f))) {
    const tool = fileSet.has("pytest.ini") || fileSet.has("tox.ini") ? "pytest" : "vitest";
    commands.push({
      label: "Test",
      command: ctx.runtime === "python" ? "pytest" : "npx vitest",
      confidence: "medium",
      evidence: TEST_CONFIGS.find((f) => fileSet.has(f)) ?? "test config",
    });
  }

  // Makefile targets (high confidence)
  if (fileSet.has("Makefile")) {
    // Only add if we haven't already got these from scripts
    if (!commands.some((c) => c.label === "Build")) {
      commands.push({ label: "Build", command: "make build", confidence: "medium", evidence: "Makefile (target inferred)" });
    }
    if (!commands.some((c) => c.label === "Test")) {
      commands.push({ label: "Test", command: "make test", confidence: "low", evidence: "Makefile (common target)" });
    }
  }

  // Docker
  if (fileSet.has("Dockerfile") || fileSet.has("docker-compose.yml") || fileSet.has("docker-compose.yaml")) {
    const hasCompose = fileSet.has("docker-compose.yml") || fileSet.has("docker-compose.yaml");
    commands.push({
      label: "Docker",
      command: hasCompose ? "docker compose up" : "docker build .",
      confidence: "high",
      evidence: hasCompose ? "docker-compose.yml" : "Dockerfile",
    });
  }

  // Sort by confidence (high first), then by label
  return commands.sort((a, b) => {
    const diff = CONF_RANK[b.confidence] - CONF_RANK[a.confidence];
    if (diff !== 0) return diff;
    return a.label.localeCompare(b.label);
  });
}

// ---------------------------------------------------------------------------
// Important directories
// ---------------------------------------------------------------------------

function inferImportantDirs(ctx: RepoContext): { name: string; description?: string }[] {
  return ctx.topDirs
    .filter((d) => d.description !== undefined || isLikelyImportant(d.name))
    .map((d) => ({
      name: d.name,
      description: d.description ?? guessDirDescription(d.name),
    }))
    .slice(0, 12);
}

function isLikelyImportant(name: string): boolean {
  const important = ["src", "app", "lib", "test", "tests", "docs", "scripts", "cmd", "pkg", "api", "config", "components", "pages", "routes", "services", "models", "db", "prisma"];
  return important.includes(name);
}

function guessDirDescription(name: string): string | undefined {
  const hints: Record<string, string> = {
    extensions: "Extension entry points",
    bin: "Executable binaries",
    dist: "Build output",
    examples: "Usage examples",
  };
  return hints[name];
}

// ---------------------------------------------------------------------------
// Conventions
// ---------------------------------------------------------------------------

function inferConventions(ctx: RepoContext): string[] {
  const conventions: string[] = [];
  const fileSet = new Set(ctx.importantFiles);
  const depSet = new Set([...(ctx.dependencies ?? []), ...(ctx.devDependencies ?? [])]);

  if (ctx.languages.some((l) => l.ext === ".ts")) {
    conventions.push("TypeScript used throughout");
  }
  if (depSet.has("eslint")) {
    conventions.push("ESLint for code linting");
  }
  if (depSet.has("prettier")) {
    conventions.push("Prettier for code formatting");
  }
  if (fileSet.has("tsconfig.json")) {
    conventions.push("TypeScript strict configuration (check tsconfig.json)");
  }
  if (fileSet.has(".github/workflows")) {
    conventions.push("GitHub Actions CI configured");
  }
  if (fileSet.has("Dockerfile") || fileSet.has("docker-compose.yml")) {
    conventions.push("Docker used for containerization");
  }

  return conventions;
}

// ---------------------------------------------------------------------------
// Uncertainties (honesty mechanism)
// ---------------------------------------------------------------------------

function inferUncertainties(ctx: RepoContext): string[] {
  const uncertainties: string[] = [];

  if (!ctx.readmeSummary) {
    uncertainties.push("No README found — purpose inferred from manifest only");
  }
  const cmds = inferCommands(ctx);
  if (!cmds.some((c) => c.label === "Test")) {
    uncertainties.push("No test command detected — test setup may be manual");
  }
  if (!cmds.some((c) => c.label === "Lint")) {
    uncertainties.push("No lint command detected");
  }
  if (ctx.runtime === "python" && !ctx.importantFiles.includes("pyproject.toml")) {
    uncertainties.push("Python project without pyproject.toml — dependency management unclear");
  }

  return uncertainties;
}

// ---------------------------------------------------------------------------
// Starting points
// ---------------------------------------------------------------------------

function inferStartingPoints(ctx: RepoContext): string[] {
  const points: string[] = [];

  // Entry point files
  for (const candidate of ["src/index.ts", "src/main.ts", "src/index.js", "src/main.js", "src/app.ts", "index.ts", "index.js", "main.py", "app.py", "src/main.py", "cmd/main.go", "main.go"]) {
    if (ctx.importantFiles.includes(candidate) || ctx.topDirs.some((d) => candidate.startsWith(d.name + "/"))) {
      points.push(candidate);
    }
  }

  // README first
  if (ctx.readmeSummary) {
    points.unshift("README.md");
  }

  // First important source dir
  const srcDir = ctx.topDirs.find((d) => d.name === "src" || d.name === "app" || d.name === "lib");
  if (srcDir && !points.some((p) => p.startsWith(srcDir.name))) {
    points.push(`${srcDir.name}/`);
  }

  return points.slice(0, 5);
}
