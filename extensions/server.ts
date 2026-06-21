/**
 * HTTP server — serves the HTML overview for remote browsers.
 *
 * Uses Node's built-in http module (zero deps). The server is a dumb
 * byte-pipe: it reads the HTML file on each request. Lifecycle is governed
 * by an idle timeout, with session_shutdown and process exit as backstops.
 */
import { createServer, type Server } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { networkInterfaces } from "node:os";
import { randomUUID } from "node:crypto";
import type { Options } from "./types.ts";

const HTML_FILE = "pi-onboard-overview.html";

export interface ServerInfo {
  urls: string[];
  reused: boolean;
  port: number;
}

/** Module-level singleton server state. */
let activeServer: Server | null = null;
let activePort = 0;
let activeToken = "";
let activeHost = "0.0.0.0";
let activeCwd = "";
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Ensure a server is running and serving the HTML overview.
 * Reuses an existing server if one is live; otherwise starts a new one.
 */
export async function ensureServer(cwd: string, opts: Options): Promise<ServerInfo | null> {
  if (opts.noServe || opts.textOnly) return null;

  // Reuse existing server — update cwd so it serves the latest HTML
  if (activeServer && activeServer.listening) {
    activeCwd = cwd;
    resetIdleTimer(opts.idleTimeout);
    return { urls: buildUrls(activeHost, activePort, activeToken), reused: true, port: activePort };
  }

  // Start new server
  const token = randomUUID();
  const host = opts.host;
  const port = opts.port ?? 0;

  const server = createServer((req, res) => {
    const url = req.url ?? "/";

    // Only serve under the token path
    if (!url.startsWith(`/${token}/`) && url !== `/${token}`) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    // Read the HTML file fresh each request (dumb byte-pipe)
    // Uses activeCwd so reused servers serve the latest repo's HTML
    const htmlPath = join(activeCwd || cwd, HTML_FILE);
    try {
      const content = readFileSync(htmlPath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Overview not generated yet.");
    }

    // Reset idle timer on each request
    resetIdleTimer(opts.idleTimeout);
  });

  // Wait for the server to actually be listening so we know the port
  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      activePort = typeof addr === "object" && addr ? addr.port : port;
      resolve();
    });
  });

  activeServer = server;
  activeToken = token;
  activeHost = host;
  activeCwd = cwd;

  // Start idle timer
  resetIdleTimer(opts.idleTimeout);

  return { urls: buildUrls(host, activePort, token), reused: false, port: activePort };
}

/** Close any active server (called on session_shutdown). */
export function closeServer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (activeServer) {
    activeServer.close();
    activeServer = null;
  }
  activeCwd = "";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetIdleTimer(timeoutMin: number): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (timeoutMin > 0) {
    idleTimer = setTimeout(() => {
      closeServer();
    }, timeoutMin * 60 * 1000);
    // Don't keep the process alive just for the timer
    idleTimer?.unref?.();
  }
}

/** Build candidate URLs from network interfaces. */
function buildUrls(host: string, port: number, token: string): string[] {
  const urls: string[] = [];

  if (host === "0.0.0.0" || host === "::") {
    // Enumerate all non-internal IPv4 addresses
    try {
      const interfaces = networkInterfaces();
      for (const [name, addrs] of Object.entries(interfaces)) {
        if (!addrs) continue;
        for (const addr of addrs) {
          if (addr.family === "IPv4" && !addr.internal) {
            urls.push(`http://${addr.address}:${port}/${token}/`);
          }
        }
      }
    } catch {
      // fall through to localhost
    }
    if (urls.length === 0) {
      urls.push(`http://localhost:${port}/${token}/`);
    }
  } else {
    urls.push(`http://${host}:${port}/${token}/`);
  }

  return urls;
}
