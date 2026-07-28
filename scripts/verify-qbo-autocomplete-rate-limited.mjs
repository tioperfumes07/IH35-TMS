#!/usr/bin/env node
/**
 * The QBO autocomplete routes must stay rate-limited.
 *
 * apps/backend/src/mdata/qbo-autocomplete.routes.ts exposes four authenticated typed-ahead endpoints
 * (vendors / customers / items / accounts). Each runs a ranked full-text scan over an entity's master
 * data, once per keystroke. Unlimited they are two things at once:
 *   - a DoS surface (cheap request, expensive query), and
 *   - a master-data ENUMERATION surface — an authorized-but-curious session can walk an entity's
 *     entire vendor and customer list by cycling prefixes.
 *
 * CodeQL flagged this as a high-severity "missing rate limiting" alert on PR #3732. The finding was
 * real and pre-existing; only the table-repoint on the same line made CodeQL surface it. Fixed rather
 * than dismissed — an allowlist entry here would have been a claim that the scanner was wrong.
 *
 * This guard asserts every route registration in that file carries a rateLimit config, so a future
 * edit cannot quietly drop it back.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES_FILE = join(process.cwd(), "apps", "backend", "src", "mdata", "qbo-autocomplete.routes.ts");

/**
 * Extract each `app.<method>(...)` registration with a balanced-paren scan rather than a line regex
 * or a fixed-width window. Proximity windows have produced four separate wrong answers in this repo;
 * the argument list is the only honest unit, so read it to its real closing paren.
 */
export function routeRegistrations(src) {
  const out = [];
  const re = /\bapp\.(get|post|put|patch|delete)\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    let inStr = null;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      const prev = src[i - 1];
      if (inStr) {
        if (ch === inStr && prev !== "\\") inStr = null;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        inStr = ch;
      } else if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      i += 1;
    }
    const args = src.slice(re.lastIndex, i - 1);
    const pathMatch = args.match(/^\s*["'`]([^"'`]+)["'`]/);
    out.push({ method: m[1], path: pathMatch ? pathMatch[1] : "(dynamic)", args });
  }
  return out;
}

/**
 * A registration is limited when its own options carry rateLimit, or when it passes an options
 * identifier that is itself bound to a rateLimit config in the same file (the shared-constant form).
 */
export function isRateLimited(args, src) {
  if (/\brateLimit\s*:/.test(args)) return true;
  const identifiers = args.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) || [];
  return identifiers.some((id) =>
    new RegExp(`\\b(const|let|var)\\s+${id}\\b[\\s\\S]{0,400}?rateLimit\\s*:`).test(src)
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();

  let src;
  try {
    src = readFileSync(ROUTES_FILE, "utf8");
  } catch {
    console.error(`verify-qbo-autocomplete-rate-limited FAIL — cannot read ${ROUTES_FILE}`);
    process.exit(1);
  }

  const routes = routeRegistrations(src);
  if (routes.length === 0) {
    // Zero routes is not a pass. If the file were renamed or restructured this guard would go
    // silently green while protecting nothing — the denominator has to be real.
    console.error("verify-qbo-autocomplete-rate-limited FAIL — found 0 route registrations; refusing to report green");
    process.exit(1);
  }

  const unlimited = routes.filter((r) => !isRateLimited(r.args, src));
  if (unlimited.length > 0) {
    console.error("verify-qbo-autocomplete-rate-limited FAIL — unlimited autocomplete route(s):");
    for (const r of unlimited) console.error(`  ${r.method.toUpperCase()} ${r.path}`);
    console.error("\nThese run a ranked full-text scan per keystroke over entity master data.");
    console.error("Add { config: { rateLimit: { max, timeWindow } } } to each registration.");
    process.exit(1);
  }

  console.log(
    `verify-qbo-autocomplete-rate-limited OK — ${routes.length}/${routes.length} route(s) rate-limited ` +
      `(${routes.map((r) => r.path).join(", ")})`
  );
}

function selftest() {
  const cases = [
    { name: "unlimited route is caught", src: `app.get("/a", factory("t"));`, expectLimited: false },
    { name: "inline rateLimit passes", src: `app.get("/a", { config: { rateLimit: { max: 1, timeWindow: "1 minute" } } }, factory("t"));`, expectLimited: true },
    { name: "shared const form passes", src: `const LIMIT = { config: { rateLimit: { max: 1, timeWindow: "1 minute" } } };\napp.get("/a", LIMIT, factory("t"));`, expectLimited: true },
    { name: "paren inside a string does not truncate the scan", src: `app.get("/a(b", { config: { rateLimit: { max: 1, timeWindow: "1 minute" } } }, factory("t"));`, expectLimited: true },
  ];
  let bad = 0;
  for (const c of cases) {
    const routes = routeRegistrations(c.src);
    const limited = routes.length > 0 && routes.every((r) => isRateLimited(r.args, c.src));
    if (limited !== c.expectLimited) {
      console.error(`  selftest FAIL — ${c.name}: expected limited=${c.expectLimited}, got ${limited}`);
      bad += 1;
    } else {
      console.log(`  selftest OK — ${c.name} (limited=${limited})`);
    }
  }
  if (bad) {
    console.error(`verify-qbo-autocomplete-rate-limited SELFTEST FAIL — ${bad}/${cases.length}`);
    process.exit(1);
  }
  console.log(`verify-qbo-autocomplete-rate-limited SELFTEST OK — ${cases.length}/${cases.length}`);
}

main();
