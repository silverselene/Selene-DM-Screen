// Guards the comment-enforced couplings between the nginx CSP
// (docker/security-headers.conf) and the app's TypeScript config:
//
//   1. CSP `frame-src` <-> EMBED_HOSTS in portalEmbed.ts. A Portal provider
//      only works end to end if it's permitted in BOTH the CSP and toEmbedUrl;
//      today that's kept in sync by a comment in each file.
//   2. CSP `connect-src` :<port> <-> the AI-bridge default port. The widget's
//      BRIDGE_URL default (aiBridge.ts) and vite.config's DEFAULT_AI_BRIDGE_PORT
//      must match the port the CSP allows, or the AI Chat widget is stuck
//      "offline" in the Docker deploy even while the bridge is running.
//
// These are pure text/parse assertions — no DOM — so they run in the tier-1
// node env. The QA review flagged both couplings as "comment-enforced only";
// this file makes them fail CI instead.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EMBED_HOSTS } from "./portalEmbed";

const dmScreenRoot = path.resolve(import.meta.dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(path.join(dmScreenRoot, rel), "utf8");
}

/** Pull the quoted value of the CSP `add_header` out of the nginx snippet. */
function cspValue(): string {
  const conf = read("docker/security-headers.conf");
  const m = conf.match(/add_header\s+Content-Security-Policy\s+"([^"]+)"/);
  if (!m) throw new Error("Could not find the Content-Security-Policy add_header in security-headers.conf");
  return m[1];
}

/** Return the space-separated sources of one CSP directive (e.g. "frame-src"). */
function directiveSources(directive: string): string[] {
  const csp = cspValue();
  const found = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d === directive || d.startsWith(directive + " "));
  if (!found) throw new Error(`CSP has no ${directive} directive`);
  return found.slice(directive.length).trim().split(/\s+/).filter(Boolean);
}

describe("CSP frame-src <-> EMBED_HOSTS", () => {
  it("lists exactly the Portal embed hosts, each as an https:// origin", () => {
    const frameSrc = directiveSources("frame-src");
    const expected = EMBED_HOSTS.map((h) => `https://${h}`);
    // Order-independent, exact set — no missing and no extra hosts.
    expect([...frameSrc].sort()).toEqual([...expected].sort());
  });
});

describe("CSP connect-src <-> AI-bridge default port", () => {
  // The single source of truth for the port default is a literal in two TS
  // files; parse both so a change in either that forgets the CSP fails here.
  function parsePort(rel: string, re: RegExp): number {
    const m = read(rel).match(re);
    if (!m) throw new Error(`Could not parse the bridge port from ${rel}`);
    return Number(m[1]);
  }

  it("keeps the vite.config default and the aiBridge BRIDGE_URL default equal", () => {
    const viteDefault = parsePort("vite.config.ts", /DEFAULT_AI_BRIDGE_PORT\s*=\s*(\d+)/);
    // Anchor on the BRIDGE_URL default assignment specifically, not any
    // 127.0.0.1 URL in the file, so a future doc comment carrying a port
    // can't shadow the real default and make this pass/fail on stale text.
    const widgetDefault = parsePort(
      "src/lib/aiBridge.ts",
      /BRIDGE_URL[^\n]*\?\?\s*"http:\/\/127\.0\.0\.1:(\d+)"/,
    );
    expect(widgetDefault).toBe(viteDefault);
  });

  it("allows both host spellings of the bridge on that port in connect-src", () => {
    const port = parsePort("vite.config.ts", /DEFAULT_AI_BRIDGE_PORT\s*=\s*(\d+)/);
    const connectSrc = directiveSources("connect-src");
    // The browser treats 127.0.0.1 and localhost as distinct origins, so both
    // must be present (matching the security-headers.conf comment).
    expect(connectSrc).toContain(`http://127.0.0.1:${port}`);
    expect(connectSrc).toContain(`http://localhost:${port}`);
  });
});
