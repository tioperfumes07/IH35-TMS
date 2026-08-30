#!/usr/bin/env node
/**
 * PERMANENT FIX — PROOF ENGINE
 *
 * THE DISEASE (every failure this session traced to it):
 *   status, prod_verified and complete are HAND-WRITTEN FLAGS, and evidence is PROSE.
 *   Nothing can falsify any of them. So they drift, silently, and the only way to catch a
 *   drifted one is a human reading prose — which is how DRV-S04 sat at PASS while its own
 *   evidence said NOT YET VERIFIED, and how five regex detectors produced five wrong numbers.
 *
 * THE CURE:
 *   status and prod_verified STOP BEING WRITABLE. They become OUTPUTS of replaying typed,
 *   executable proofs against the CURRENT live SHA. Evidence stops being prose you trust and
 *   becomes assertions a machine re-runs.
 *
 *   An item with no executable proof CANNOT say PASS. Not "should not" — cannot.
 *   That is what makes the fix permanent instead of another finding.
 *
 * SHADOW MODE (owner 2026-08-30): do NOT call assertNoHandWrittenVerdict from
 * verify-module-completion. Typed status/prod_verified stay until a module's
 * disagreement list is empty. Enforcement last.
 */

/* ---------- proof kinds: each is REPLAYABLE and CAN FAIL ---------- */
export const KINDS = {
  http:     "fetch a live route and assert on status / JSON path",
  sql:      "run a scoped read and assert on the result",
  dom:      "drive the live page and assert an element renders",
  guard:    "execute a guard script and assert its exit code",
  mutation: "defeat a check, re-run, assert it FAILS (proves the check is real)",
};

const cmp = (a, op, b) => ({
  "==": a === b, "!=": a !== b, ">=": a >= b, "<=": a <= b,
  ">": a > b, "<": a < b, "exists": a !== undefined && a !== null,
  "nonempty": Array.isArray(a) ? a.length > 0 : !!a,
}[op]);

const jpath = (o, p) =>
  p.replace(/^\$\.?/, "").split(".").filter(Boolean)
   .reduce((v, k) => (v == null ? v : v[/^\d+$/.test(k) ? Number(k) : k]), o);

/* ---------- replay one proof ---------- */
export async function replay(proof, ctx) {
  const t0 = Date.now();
  const done = (ok, observed, err) =>
    ({ ok, observed, err: err || null, kind: proof.kind, ms: Date.now() - t0 });
  try {
    if (proof.kind === "http") {
      const url = proof.url || `${ctx.base || ""}${proof.path || ""}`;
      const r = await ctx.fetch(url, { method: proof.method || "GET" });
      const expect = proof.expect || {};
      // CERT-01 B5/B6: 404/0 = unmounted FAIL; 200/301/302/401/403 = mounted.
      if (expect.mount === true) {
        const n = Number(r.status);
        if (!Number.isFinite(n) || n === 0 || n === 404)
          return done(false, `HTTP ${r.status}`);
        return done(true, `HTTP ${r.status}`);
      }
      if (Array.isArray(expect.statusIn) && !expect.statusIn.includes(r.status))
        return done(false, `HTTP ${r.status}`);
      if (expect.status !== undefined && r.status !== expect.status)
        return done(false, `HTTP ${r.status}`);
      if (expect.json_path) {
        const v = jpath(await r.json(), expect.json_path);
        return done(cmp(v, expect.op, expect.value), v);
      }
      return done(true, `HTTP ${r.status}`);
    }
    if (proof.kind === "guard") {
      const rc = await ctx.exec(proof.script, proof.args || []);
      return done(rc === (proof.expect.exit ?? 0), `exit ${rc}`);
    }
    if (proof.kind === "mutation") {
      // the only proof that proves a CHECK is real: defeat it, demand failure
      const rc = await ctx.exec(proof.script, [...(proof.args || []), "--defeat=" + proof.defeat]);
      return done(rc !== 0, `exit ${rc} (must be non-zero)`);
    }
    if (proof.kind === "sql" || proof.kind === "dom")
      return done(false, null, `${proof.kind} runner not wired in this prototype`);
    return done(false, null, `unknown kind "${proof.kind}"`);
  } catch (e) { return done(false, null, String(e.message || e).slice(0, 120)); }
}

/* ---------- THE RULE: status is DERIVED. Never read from the file. ---------- */
export function deriveStatus(item, results, liveSha) {
  const proofs = Array.isArray(item.proofs) ? item.proofs : [];

  // 1. No executable proof -> cannot be PASS. This is what kills DRV-S04 forever.
  if (proofs.length === 0)
    return { status: "UNVERIFIED", prod_verified: false,
             why: "no executable proof — prose evidence cannot produce PASS" };

  // 2. Any proof failed -> FAIL. Visible, not hidden behind a stale PASS.
  const bad = results.filter(r => !r.ok);
  if (bad.length)
    return { status: "FAIL", prod_verified: false,
             why: `${bad.length}/${results.length} proof(s) failed: ` +
                  bad.map(b => `${b.kind}(${b.err || b.observed})`).join(", ") };

  // 3. Passed, but not at the SHA that is live right now -> STALE, never PASS.
  if (!item.proven_at_sha || !liveSha || item.proven_at_sha !== liveSha)
    return { status: "STALE", prod_verified: false,
             why: `proven at ${item.proven_at_sha || "unknown"}, live is ${liveSha}` };

  // 4. All proofs replayed green at the live SHA.
  return { status: "PASS", prod_verified: true,
           why: `${results.length}/${results.length} proofs replayed at ${liveSha}` };
}

/* ---------- the guard that makes it permanent ---------- */
export function assertNoHandWrittenVerdict(rawItem) {
  const banned = ["status", "prod_verified", "live_verified_sha", "live_verified_at"];
  const found = banned.filter(k => k in rawItem);
  if (found.length)
    throw new Error(
      `HAND-WRITTEN VERDICT REJECTED on ${rawItem.id}: ${found.join(", ")}. ` +
      `These are OUTPUTS of replay, not inputs. Supply proofs[] instead.`);
  return true;
}
