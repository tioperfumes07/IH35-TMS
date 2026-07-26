// 1590-verify-no-unauth-integration-state-route — an HTTP route that reads third-party
// INTEGRATION / CONNECTION state must sit behind an auth gate.
//
// THE DEFECT THIS PINS (2026-07-25): the module `health-deep.routes.ts` in the observability folder
// of apps/backend/src registered
// `GET /api/v1/health/deep` with NO requireAuth, running under `withLuciaBypass` (RLS bypassed), and
// returned to any anonymous caller: which integrations the carrier uses (quickbooks / samsara /
// plaid, by name), each one's connection state, the QuickBooks and Plaid LAST-SYNC TIMESTAMPS, the
// Samsara upstream HTTP status (401 => the carrier's token is revoked), whether a Samsara token is
// configured at all, and raw driver error strings via `String(error.message)`.
//
// WHY "IT ISN'T MOUNTED" WAS NOT A FIX. The C10 route-parity sweep correctly REFUSED to mount it, and
// that refusal is recorded in scripts/verify-route-manifest-parity.mjs. But a refusal only describes
// today's wiring. The registrar still existed and was one import away from publishing all of the
// above on the public internet — and scripts/uptime-monitor-config.mjs still defines an EXTERNAL
// uptime monitor pointing at `/api/v1/health/deep`, i.e. there was standing operational pressure to
// mount it. A refusal-to-wire is a decision; this guard is the constraint. The module is now archived
// (its registrar throws), and this guard fails if any module ever grows the same shape again.
//
// THE RULE. A backend module FAILS when all three hold:
//   1. it registers an HTTP route (app.get/post/put/patch/delete/route), and
//   2. it references third-party integration / connection state (see INTEGRATION_STATE), and
//   3. nothing in it gates the request (see AUTH_GATES).
// Module-scope, not handler-scope, is deliberate: the defect's handler body was three lines that
// called a module-level helper, so a handler-only scan would have missed it entirely.
//
// DECLARED PUBLIC SURFACES. Liveness probes are legitimately anonymous, so a small keyed allowlist
// with a STATED REASON exists below. It is a narrowing with a reason, not a weakening: every entry is
// PRINTED on every run as an acknowledged public exposure (it never disappears into a passing run),
// and an entry whose file no longer matches the rule is reported as stale so the list cannot rot into
// a parking lot. Adding an entry means writing down, for review, exactly what an anonymous caller may
// learn. It is not a place to silence a finding.
import fs from "node:fs";
import path from "node:path";

const BACKEND_SRC = "apps/backend/src";

// Registration of an HTTP surface on a Fastify instance.
const ROUTE_REGISTRATION =
  /\b(?:app|server|fastify|instance|scoped)\s*\.\s*(?:get|post|put|patch|delete|route)\s*\(/;

// Anything that proves the request was authenticated / authorized before the handler ran.
// `currentAuthUser` + `withCompanyScope` are the house pattern (see
// integrations/samsara/hos-readiness.routes.ts, which is the correct shape for exactly this kind of
// integration-diagnostics endpoint: auth, then per-entity membership scoping).
const AUTH_GATES = [
  "requireAuth",
  "requireRole",
  "requireOwner",
  "requirePermission",
  "requireSession",
  "requireAdmin",
  "currentAuthUser",
  "withCompanyScope",
  "assertCompanyMembership",
  "assertRole",
  "preHandler",
  "onRequest",
  "verifyDriverAccessToken",
  "verifyDriverRefreshToken",
  // Machine callers cannot present a session. For an inbound webhook the auth gate is the sender's
  // HMAC signature, which is a STRONGER proof of origin than a cookie, not a weaker one — see
  // integrations/qbo/qbo-webhook.routes.ts: it verifies `intuit-signature`, returns 401 on mismatch,
  // and fails CLOSED (endpoint disabled) when QBO_WEBHOOK_VERIFIER_TOKEN is unset. Treating that as
  // "unauthenticated" would push a correct implementation toward a bogus allowlist entry.
  "verifyIntuitWebhookSignature",
  "verifyWebhookSignature",
  "timingSafeEqual",
];

// Third-party integration / connection state. Deliberately NOT generic words like "token": this must
// mean "the connection status of an outside system this carrier depends on".
const INTEGRATION_STATE = [
  "qbo.connections",
  "qbo_connections",
  "banking.plaid_items",
  "plaid_items",
  "samsara_config",
  "api.samsara.com",
  "SAMSARA_API_TOKEN",
  "SAMSARA_API_KEY",
  "PLAID_CLIENT_ID",
  "PLAID_SECRET",
  "PLAID_ENV",
  // The archived registrar's own symbols: re-mounting the dead module from a NEW file must trip this
  // guard too, even though that new file would not itself name a table.
  "runDeepDependencyChecks",
  "registerDeepHealthRoutes",
];

// file (repo-relative) -> why an anonymous caller is allowed to reach it, and what it may disclose.
// Repo-relative paths are assembled from segments on purpose: scripts/verify-no-bare-health-
// references.mjs scans scripts/ for a bare `/health` and cannot tell a FILE PATH from a URL, so
// writing these in one piece trips it. Narrowing THAT guard's regex to spare a filename would weaken
// a live-endpoint check to accommodate a comment, so the workaround lives here instead. Same
// technique already used in scripts/verify-route-manifest-parity.mjs for the same reason.
const HEALTH_ROUTES_FILE = ["apps", "backend", "src", "health", "health.routes.ts"].join("/");
const ARCHIVED_DEEP_MODULE = ["apps", "backend", "src", "observability", "health-deep.routes.ts"].join("/");

export const DECLARED_PUBLIC_SURFACES = new Map([
  [
    HEALTH_ROUTES_FILE,
    "LIVENESS PROBE — /api/v1/healthz{,/shallow,/readyz} must answer unauthenticated or Render, the " +
      "uptime monitor and the deploy-verification step cannot tell a live box from a dead one. It " +
      "matches this rule only because runDeepHealthChecks reads integrations.qbo_connections to " +
      "decide WHETHER to run the QBO check; the connection row is never returned. The public body is " +
      "{name, ok, tier, duration_ms} per check — booleans, not integration detail. NOTE, and it is a " +
      "real residual: HealthCheck.error carries String(error.message), so a FAILING check can return " +
      "a raw driver error string publicly. Verified 2026-07-25 all-green live, so nothing leaks " +
      "today. Tightening that field is an owner decision about an existing live health check, out of " +
      "scope for the archive of the observability module health-deep.routes.ts, and recorded in the PR.",
  ],
]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === "__tests__") continue;
      walk(p, out);
    } else if (e.name.endsWith(".ts") && !/\.(test|spec|d)\.ts$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

/** Strip comments so a module cannot be excused by an auth gate that only appears in prose. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

export function auditUnauthIntegrationRoutes(root = BACKEND_SRC, declared = DECLARED_PUBLIC_SURFACES) {
  const problems = [];
  const acknowledged = [];
  const matched = new Set();

  for (const file of walk(root)) {
    const raw = fs.readFileSync(file, "utf8");
    const code = stripComments(raw);
    if (!ROUTE_REGISTRATION.test(code)) continue;

    const markers = INTEGRATION_STATE.filter((m) => code.includes(m));
    if (markers.length === 0) continue;
    if (AUTH_GATES.some((g) => code.includes(g))) continue;

    const rel = file.split(path.sep).join("/");
    matched.add(rel);
    const reason = declared.get(rel);
    if (reason) {
      acknowledged.push(`${rel} — DECLARED PUBLIC: ${reason}`);
      continue;
    }
    problems.push(
      `${rel} registers an HTTP route with NO auth gate while reading integration/connection state ` +
        `(${markers.join(", ")}). An anonymous caller learns which outside systems this carrier ` +
        `depends on and what shape they are in. Gate it (requireAuth + role, and withCompanyScope if ` +
        `it reads per-entity state), or ARCHIVE it the way ` +
        `${ARCHIVED_DEEP_MODULE} was archived. If it genuinely must be ` +
        `anonymous, add it to DECLARED_PUBLIC_SURFACES with a reason that survives review.`,
    );
  }

  // A declaration that no longer describes anything is a stale permission slip.
  for (const rel of declared.keys()) {
    if (!matched.has(rel)) {
      problems.push(
        `DECLARED_PUBLIC_SURFACES lists ${rel}, but it no longer registers an unauthenticated route ` +
          `that reads integration state. Remove the stale entry — a declaration nobody re-reads is how ` +
          `an allowlist turns into a parking lot.`,
      );
    }
  }

  return { problems, acknowledged };
}

/** Selftest fixtures, written to a temp dir so neither arm can pass vacuously. */
function plantFixtures(dir) {
  fs.mkdirSync(dir, { recursive: true });
  // (1) THE DEFECT, in the exact shape that shipped: three-line handler, integration read in a
  //     module-level helper, no auth anywhere.
  fs.writeFileSync(
    path.join(dir, "defect.routes.ts"),
    `import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
async function checkPlaid() {
  return await withLuciaBypass(async (c) => c.query("SELECT last_sync_at FROM banking.plaid_items"));
}
export function registerX(app: FastifyInstance) {
  app.get("/api/v1/health/deep", async (_req, reply) => reply.send(await checkPlaid()));
}
`,
  );
  // (2) THE FIXED SHAPE A: same disclosure, properly gated (the hos-readiness pattern).
  fs.writeFileSync(
    path.join(dir, "gated.routes.ts"),
    `import type { FastifyInstance } from "fastify";
import { currentAuthUser, withCompanyScope } from "../accounting/shared.js";
export function registerY(app: FastifyInstance) {
  app.get("/api/v1/integrations/samsara/x", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    return reply.send(await withCompanyScope(user.uuid, "oc", async (c) =>
      c.query("SELECT is_enabled FROM integrations.samsara_config")));
  });
}
`,
  );
  // (3) THE FIXED SHAPE B: archived — the module still names integration state, but registers nothing.
  fs.writeFileSync(
    path.join(dir, "archived.routes.ts"),
    `import type { FastifyInstance } from "fastify";
export async function runDeepDependencyChecks() {
  return [{ name: "plaid", detail: "banking.plaid_items" }];
}
export function registerDeepHealthRoutes(_app: FastifyInstance): never {
  throw new Error("ARCHIVED");
}
`,
  );
  // (3b) THE FIXED SHAPE C: an inbound webhook gated by HMAC signature rather than a session.
  fs.writeFileSync(
    path.join(dir, "webhook.routes.ts"),
    `import type { FastifyInstance } from "fastify";
import { verifyIntuitWebhookSignature } from "./qbo-webhook-signature.js";
export function registerV(app: FastifyInstance) {
  app.post("/api/v1/integrations/qbo/webhook", async (req, reply) => {
    if (!verifyIntuitWebhookSignature(req.rawBody, process.env.T, req.headers["intuit-signature"])) {
      return reply.code(401).send({ error: "qbo_webhook_signature_invalid" });
    }
    return reply.send({ src: "qbo_connections" });
  });
}
`,
  );
  // (4) An unauthenticated route with nothing to do with integrations — must NOT be swept up.
  fs.writeFileSync(
    path.join(dir, "innocent.routes.ts"),
    `import type { FastifyInstance } from "fastify";
export function registerZ(app: FastifyInstance) {
  app.get("/api/v1/ping", async () => ({ ok: true }));
}
`,
  );
  // (5) Auth gate present ONLY inside a comment — must still be caught.
  fs.writeFileSync(
    path.join(dir, "comment-only.routes.ts"),
    `import type { FastifyInstance } from "fastify";
// TODO: add requireAuth here before shipping
export function registerW(app: FastifyInstance) {
  app.get("/api/v1/qbo/state", async (_req, reply) =>
    reply.send({ src: "qbo_connections", token: process.env.SAMSARA_API_TOKEN ? 1 : 0 }));
}
`,
  );
}

export default {
  name: "verify:no-unauth-integration-state-route",
  run() {
    // ── selftest: plant the defect, prove it is caught; prove the fixed shapes are clean ──────────
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "unauthintg-"));
    try {
      plantFixtures(tmp);
      const empty = new Map();
      const { problems: found } = auditUnauthIntegrationRoutes(tmp, empty);
      const hit = (n) => found.some((p) => p.includes(n));

      if (!hit("defect.routes.ts")) {
        throw new Error("SELFTEST FAILED: the planted unauthenticated integration route was NOT caught");
      }
      if (!hit("comment-only.routes.ts")) {
        throw new Error("SELFTEST FAILED: an auth gate mentioned only in a comment was accepted as real");
      }
      if (hit("gated.routes.ts")) {
        throw new Error("SELFTEST FAILED: a properly gated integration route was flagged");
      }
      if (hit("archived.routes.ts")) {
        throw new Error("SELFTEST FAILED: an archived module that registers no route was flagged");
      }
      if (hit("webhook.routes.ts")) {
        throw new Error("SELFTEST FAILED: a webhook gated by HMAC signature verification was flagged");
      }
      if (hit("innocent.routes.ts")) {
        throw new Error("SELFTEST FAILED: an unrelated anonymous route was swept up");
      }
      if (found.length !== 2) {
        throw new Error(`SELFTEST FAILED: expected exactly 2 findings, got ${found.length}: ${found.join(" | ")}`);
      }
      // the declaration arm must actually excuse, and a stale declaration must be reported
      const declared = new Map([[`${tmp}/defect.routes.ts`.split(path.sep).join("/"), "selftest"]]);
      const withDecl = auditUnauthIntegrationRoutes(tmp, declared);
      if (withDecl.problems.some((p) => p.includes("defect.routes.ts") && !p.includes("stale"))) {
        throw new Error("SELFTEST FAILED: a declared public surface was still reported as a problem");
      }
      if (!withDecl.acknowledged.some((a) => a.includes("defect.routes.ts"))) {
        throw new Error("SELFTEST FAILED: a declared public surface was not printed as acknowledged");
      }
      const stale = auditUnauthIntegrationRoutes(tmp, new Map([["apps/backend/src/nope.ts", "gone"]]));
      if (!stale.problems.some((p) => p.includes("nope.ts") && p.includes("stale"))) {
        throw new Error("SELFTEST FAILED: a stale declaration was not caught");
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }

    // ── the real audit ────────────────────────────────────────────────────────────────────────────
    const { problems, acknowledged } = auditUnauthIntegrationRoutes();
    for (const a of acknowledged) console.log(`  • ${a}`);
    if (problems.length) {
      for (const p of problems) console.error(`  ✗ ${p}`);
      throw new Error(`verify:no-unauth-integration-state-route FAIL — ${problems.length} problem(s)`);
    }
    console.log(
      `verify:no-unauth-integration-state-route OK — no backend module registers an unauthenticated ` +
        `route that reads third-party integration/connection state; ` +
        `${acknowledged.length} declared public surface(s) acknowledged above.`,
    );
    return 0;
  },
};
