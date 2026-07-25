#!/usr/bin/env node
// verify:held-registry-integrity
//
// db/migrations/.held-migrations.json decides which migrations db:migrate REFUSES to run on prod, and
// scripts/verify-schema-parity-from-prod.mjs (verify-step 1437) derives its entire "held-unapplied column"
// set from it. It is therefore a control file, and it was corrupt:
//
//   * 119 entries for 110 unique files — 9 files duplicated.
//   * 7 of those duplicates carried CONTRADICTORY applied_on_prod (one entry unset, one true) — and they were
//     precisely the migrations behind SAF-F02/F03/F04. heldUnappliedColumns() short-circuits on
//     `applied_on_prod === true` but keeps iterating, so the unset duplicate won and applied columns were
//     classified unapplied.
//   * 79 of the 110 were ALREADY APPLIED on prod with no flag saying so (11 correct, 9 genuinely held).
//
// Net effect: the guard built to prevent false PASSes was fed a registry that misreported 79 applied
// migrations as unapplied — the mechanism behind the audit's repeated "this held column is absent on prod"
// conclusions, several of which were false (I verified four of the named columns DO exist on prod).
// verify-hold-migrations-registered.mjs cannot see any of this: it collapses the list into
// `new Set(held.map(h => h.file))`, discarding duplicates and never comparing flags.
//
// WHAT THIS GUARD PROVES, honestly: it has no DB access, so it validates the flags against the PINNED prod
// ledger snapshot `scripts/lib/prod-migration-ledger-checksums.json` — a committed artifact of
// `_system._schema_migrations`. That makes the check closable OFFLINE in CI. Its limits are stated, not
// hidden: the snapshot has a `window_from` and a newest entry, so any registry file outside that range
// cannot be validated here and is reported as such rather than silently passed.
//
// FAILS on the pre-fix registry (duplicates + contradictions + 79 unflagged) and PASSES on the repaired one.
// `--selftest` mutates a REAL copy of the registry, one case per assertion.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify:held-registry-integrity";
const SELFTEST = process.argv.includes("--selftest");

const REGISTRY = "db/migrations/.held-migrations.json";
const SNAPSHOT = "scripts/lib/prod-migration-ledger-checksums.json";

const readJson = (rel, sources) =>
  sources && rel in sources ? JSON.parse(sources[rel]) : JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

export function assertHeldRegistryIntegrity(sources) {
  const errs = [];
  const info = [];

  let reg;
  let snap;
  try {
    reg = readJson(REGISTRY, sources);
  } catch (e) {
    return [`${REGISTRY}: unreadable/invalid JSON — ${String(e?.message || e)}`];
  }
  try {
    snap = readJson(SNAPSHOT, sources);
  } catch (e) {
    return [`${SNAPSHOT}: unreadable — the prod-ledger snapshot is this guard's offline oracle (${String(e?.message || e)})`];
  }

  const held = Array.isArray(reg?.held) ? reg.held : null;
  if (!held) return [`${REGISTRY}: missing a "held" array`];

  const applied = new Set(Object.keys(snap?.checksums ?? {}));
  const windowFrom = snap?.window_from;
  if (!windowFrom || applied.size === 0) {
    return [`${SNAPSHOT}: missing window_from or checksums — cannot validate applied_on_prod offline`];
  }
  const windowTo = [...applied].sort().pop();

  // ── 1. every file appears EXACTLY ONCE ────────────────────────────────────────────────────────────
  const seen = new Map();
  for (const e of held) {
    if (!e || typeof e.file !== "string") {
      errs.push(`${REGISTRY}: an entry has no "file" string`);
      continue;
    }
    if (!seen.has(e.file)) seen.set(e.file, []);
    seen.get(e.file).push(e);
  }
  for (const [file, entries] of seen) {
    if (entries.length > 1) {
      const flags = entries.map((e) => (e.applied_on_prod === true ? "true" : "unset"));
      const contradictory = new Set(flags).size > 1;
      errs.push(
        `${REGISTRY}: ${file} appears ${entries.length} times (applied_on_prod: ${flags.join(", ")})${
          contradictory
            ? " — CONTRADICTORY. heldUnappliedColumns() short-circuits on true but keeps iterating, so the unset entry wins and an applied migration is classified unapplied."
            : " — duplicates make the file ambiguous as a control."
        }`,
      );
    }
  }

  // ── 2. each entry must justify itself and use a legal flag value ──────────────────────────────────
  for (const [file, entries] of seen) {
    for (const e of entries) {
      if (!e.reason || String(e.reason).trim().length < 10) {
        errs.push(`${REGISTRY}: ${file} has no meaningful "reason" — a held migration must say why it is held`);
      }
      if ("applied_on_prod" in e && e.applied_on_prod !== true) {
        errs.push(
          `${REGISTRY}: ${file} has applied_on_prod=${JSON.stringify(e.applied_on_prod)} — the only legal value is boolean true (absent means not applied); a falsy-but-present value reads as a claim while behaving as silence`,
        );
      }
    }
  }

  // ── 3. flags must AGREE with the pinned prod ledger, inside the window it covers ──────────────────
  const unassertable = [];
  for (const [file, entries] of seen) {
    const flagged = entries.some((e) => e.applied_on_prod === true);
    if (file < windowFrom || file > windowTo) {
      unassertable.push(`${file}${flagged ? " (flagged applied)" : ""}`);
      continue;
    }
    const inLedger = applied.has(file);
    if (inLedger && !flagged) {
      errs.push(
        `${REGISTRY}: ${file} IS in the prod ledger snapshot but is not flagged applied_on_prod — step 1437 will treat its columns as held-unapplied and can report a false "absent on prod"`,
      );
    }
    if (!inLedger && flagged) {
      errs.push(
        `${REGISTRY}: ${file} is flagged applied_on_prod but is NOT in the prod ledger snapshot — either the flag is wrong or the snapshot is stale; do not guess, re-verify against the live ledger`,
      );
    }
  }

  if (unassertable.length) {
    info.push(
      `${unassertable.length} registry file(s) fall outside the snapshot window ${windowFrom}..${windowTo} and CANNOT be validated offline: ${unassertable.join(", ")}`,
    );
  }

  return errs.concat(info.map((m) => `INFO: ${m}`));
}

const realErrors = (out) => out.filter((m) => !m.startsWith("INFO: "));

if (SELFTEST) {
  const live = {
    [REGISTRY]: fs.readFileSync(path.join(ROOT, REGISTRY), "utf8"),
    [SNAPSHOT]: fs.readFileSync(path.join(ROOT, SNAPSHOT), "utf8"),
  };
  const failures = [];
  const expectCaught = (name, mutate, needle) => {
    const reg = JSON.parse(live[REGISTRY]);
    mutate(reg);
    const mutated = { ...live, [REGISTRY]: JSON.stringify(reg, null, 2) };
    if (mutated[REGISTRY] === live[REGISTRY]) {
      failures.push(`${name}: inert — the mutation did not change the source`);
      return;
    }
    const problems = realErrors(assertHeldRegistryIntegrity(mutated));
    if (!problems.some((x) => x.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  // The four shapes the real registry actually exhibited.
  expectCaught(
    "duplicate-entry-with-contradictory-flag",
    (reg) => {
      const applied = reg.held.find((e) => e.applied_on_prod === true);
      reg.held.push({ file: applied.file, reason: "duplicate entry as it existed before the repair" });
    },
    "CONTRADICTORY",
  );
  expectCaught(
    "applied-migration-loses-its-flag",
    (reg) => {
      const e = reg.held.find((x) => x.applied_on_prod === true);
      delete e.applied_on_prod;
    },
    "is not flagged applied_on_prod",
  );
  expectCaught(
    "flag-claims-applied-but-ledger-disagrees",
    (reg) => {
      // held[] may legitimately have every entry already applied_on_prod:true, so this can't rely
      // on finding an unstamped entry — synthesize one whose filename sorts inside the pinned
      // snapshot's window (so section 3 doesn't dismiss it as unassertable) but that is not itself
      // one of the snapshot's real checksummed files.
      const snap = JSON.parse(live[SNAPSHOT]);
      reg.held.push({
        file: `${snap.window_from}_selftest_not_in_ledger.sql`,
        reason: "synthetic entry for the ledger-disagreement fixture",
        applied_on_prod: true,
      });
    },
    "NOT in the prod ledger snapshot",
  );
  expectCaught(
    "illegal-false-flag",
    (reg) => {
      reg.held[0].applied_on_prod = false;
    },
    "only legal value is boolean true",
  );
  expectCaught(
    "entry-without-a-reason",
    (reg) => {
      reg.held[1].reason = "";
    },
    'no meaningful "reason"',
  );

  const liveProblems = realErrors(assertHeldRegistryIntegrity(live));
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 5 planted defects caught, live registry clean`);
  process.exit(0);
}

const out = assertHeldRegistryIntegrity();
for (const m of out.filter((x) => x.startsWith("INFO: "))) console.error(`  ${m}`);
const problems = realErrors(out);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — every held file appears once, every flag agrees with the pinned prod ledger snapshot inside its window, and every entry carries a reason.`,
);
