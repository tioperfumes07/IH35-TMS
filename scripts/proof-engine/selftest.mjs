#!/usr/bin/env node
import { replay, deriveStatus, assertNoHandWrittenVerdict } from "./proof-engine.mjs";

let pass = 0;
let fail = 0;

async function t(n, f) {
  try {
    await f();
    console.log("  PASS  " + n);
    pass++;
  } catch (e) {
    console.log("  FAIL  " + n + " :: " + e.message);
    fail++;
  }
}

const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
  }
};

console.log("PROOF ENGINE SELFTEST — each arm plants a defect and demands rejection\n");

await t("DRV-S04 shape (prose only, no proofs) CANNOT be PASS", () => {
  const r = deriveStatus(
    { id: "DRV-S04", evidence: "NOT YET VERIFIED. Surface enumerated..." },
    [],
    "84188fa",
  );
  eq(r.status, "UNVERIFIED", "status");
  eq(r.prod_verified, false, "pv");
});

await t("a hand-written status:PASS is REJECTED at load", () => {
  let threw = false;
  try {
    assertNoHandWrittenVerdict({ id: "X", status: "PASS", prod_verified: true });
  } catch (e) {
    threw = /HAND-WRITTEN VERDICT REJECTED/.test(e.message);
  }
  if (!threw) throw new Error("hand-written verdict was accepted");
});

await t("one failing proof => FAIL, never a silent PASS", () => {
  const r = deriveStatus(
    { id: "X", proofs: [{ kind: "http" }], proven_at_sha: "84188fa" },
    [{ ok: false, kind: "http", err: "HTTP 500" }],
    "84188fa",
  );
  eq(r.status, "FAIL", "status");
});

await t("passed at an OLD sha => STALE, never PASS", () => {
  const r = deriveStatus(
    { id: "X", proofs: [{ kind: "http" }], proven_at_sha: "0dd70bf" },
    [{ ok: true, kind: "http" }],
    "84188fa",
  );
  eq(r.status, "STALE", "status");
  eq(r.prod_verified, false, "pv");
});

await t("all proofs green at the LIVE sha => PASS", () => {
  const r = deriveStatus(
    { id: "X", proofs: [{ kind: "http" }], proven_at_sha: "84188fa" },
    [{ ok: true, kind: "http" }],
    "84188fa",
  );
  eq(r.status, "PASS", "status");
  eq(r.prod_verified, true, "pv");
});

await t("mutation proof: a guard that SURVIVES being defeated => FAIL", async () => {
  const ctx = { exec: async () => 0 };
  const r = await replay({ kind: "mutation", script: "g.mjs", defeat: "x" }, ctx);
  if (r.ok) throw new Error("survived mutation was accepted");
});

await t("RPT-VERIFY-01 shape: sibling PASS is not a proof kind", () => {
  const r = deriveStatus(
    {
      id: "RPT-VERIFY-01",
      evidence: "PROD-VERIFIED from OUTBOX + tip RPT-S01..S07 PASS",
    },
    [],
    "84188fa",
  );
  eq(r.status, "UNVERIFIED", "circular closure must not yield PASS");
});

console.log(`\nSELFTEST ${fail === 0 ? "PASS" : "FAIL"} ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
