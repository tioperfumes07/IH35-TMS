#!/usr/bin/env node
// verify:prod-ledger-checksum-parity
//
// THE REAL FIX for the 2026-07-24 deploy outage. The existing "reject edited applied migrations" guard
// only checks CI-internal from-0001 consistency; it does NOT compare committed migration checksums to
// the PROD ledger. So editing a migration that was already applied on prod (e.g. the deactivated_at
// seed-carry "parity" edits to 870/890/910) went GREEN in CI and only exploded at deploy, when
// db:migrate's checksum verify aborts ("modified after apply") and the app never boots.
//
// This guard moves that check into CI: for every migration recorded in the pinned prod-ledger snapshot
// (scripts/lib/prod-migration-ledger-checksums.json), the committed file MUST hash (sha256) to its
// pinned value, OR have a matching entry in scripts/lib/migration-checksum-overrides.json
// (ledger_checksum == pinned AND disk_checksum == committed). Any post-apply edit without an override
// FAILS here, before it can reach a deploy.
//
// LEGAL ways to change an applied migration (per owner rule 2026-07-24):
//   (a) add a checksum-override in the SAME PR, or (b) write a forward migration. No exceptions.
//
// `--selftest` simulates a post-apply edit (mutates a real migration's bytes) and asserts the guard
// catches it, then asserts the live tree is fully reconciled.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const LABEL = "verify:prod-ledger-checksum-parity";
const SELFTEST = process.argv.includes("--selftest");
const MANIFEST = path.join(ROOT, "scripts/lib/prod-migration-ledger-checksums.json");
const OVERRIDES = path.join(ROOT, "scripts/lib/migration-checksum-overrides.json");
const MIGRATIONS = path.join(ROOT, "db/migrations");

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function loadPinned() {
  return JSON.parse(fs.readFileSync(MANIFEST, "utf8")).checksums;
}
function loadOverrides() {
  const arr = JSON.parse(fs.readFileSync(OVERRIDES, "utf8"));
  const m = new Map();
  for (const e of arr) if (e?.filename) m.set(e.filename, e);
  return m;
}

// diskShaByFile: optional injected {filename: sha256} (selftest). When absent, hashes the real files.
export function assertLedgerParity(pinned, overrides, diskShaByFile) {
  const errs = [];
  for (const [file, pinnedSha] of Object.entries(pinned)) {
    const abs = path.join(MIGRATIONS, file);
    let diskSha;
    if (diskShaByFile && file in diskShaByFile) diskSha = diskShaByFile[file];
    else if (fs.existsSync(abs)) diskSha = sha256(fs.readFileSync(abs));
    else continue; // file recorded on prod but absent on this branch — not this guard's concern
    if (diskSha === pinnedSha) continue;
    const ov = overrides.get(file);
    if (ov && ov.ledger_checksum === pinnedSha && ov.disk_checksum === diskSha) continue;
    errs.push(
      `${file}: committed sha ${diskSha.slice(0, 12)} != prod ledger ${pinnedSha.slice(0, 12)} and no matching override. ` +
        `An applied migration was edited without reconciliation — this WILL break the next deploy. ` +
        `Legal fixes: (a) add a checksum-override {ledger_checksum:${pinnedSha.slice(0, 12)}…, disk_checksum:${diskSha.slice(0, 12)}…} in scripts/lib/migration-checksum-overrides.json, or (b) revert the edit and use a forward migration.`
    );
  }
  return errs;
}

if (SELFTEST) {
  const pinned = loadPinned();
  const overrides = loadOverrides();
  const failures = [];

  // 1) the live tree must be fully reconciled right now.
  const live = assertLedgerParity(pinned, overrides);
  if (live.length) failures.push(`live NOT reconciled: ${live[0]}`);

  // 2) a simulated post-apply edit (any pinned file's sha flipped, no override) MUST be caught.
  const someFile = Object.keys(pinned).find((f) => fs.existsSync(path.join(MIGRATIONS, f)));
  if (!someFile) failures.push("selftest: no pinned migration present on disk to mutate");
  else {
    const mutated = { [someFile]: "0".repeat(64) }; // pretend the committed file was edited post-apply
    const caught = assertLedgerParity(pinned, overrides, mutated);
    if (!caught.some((e) => e.startsWith(someFile))) failures.push("selftest: a post-apply edit was NOT caught");
  }

  // 3) an override that matches the mutated sha must SUPPRESS the failure (proves the legal escape works).
  const f2 = Object.keys(pinned).find((f) => fs.existsSync(path.join(MIGRATIONS, f)));
  const fakeSha = "a".repeat(64);
  const ov2 = new Map(overrides);
  ov2.set(f2, { filename: f2, ledger_checksum: pinned[f2], disk_checksum: fakeSha });
  const suppressed = assertLedgerParity(pinned, ov2, { [f2]: fakeSha });
  if (suppressed.some((e) => e.startsWith(f2))) failures.push("selftest: a matching override did NOT suppress the drift");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — post-apply edit caught, override suppresses it, live tree reconciled`);
  process.exit(0);
}

const errs = assertLedgerParity(loadPinned(), loadOverrides());
if (errs.length) {
  console.error(`${LABEL} FAIL — ${errs.length} applied migration(s) drifted from the prod ledger:`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`${LABEL} OK — every pinned prod-applied migration matches its committed file or a checksum-override.`);
