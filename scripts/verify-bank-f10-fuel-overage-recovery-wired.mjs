#!/usr/bin/env node
/**
 * BANK-F10 — fuel-card overage driver recovery wiring (manifest keep-guard).
 *
 * Asserts FUEL-03 supersession + approve-then-recover HTTP surface mounted (DOD-A):
 *   - GET  /api/v1/fuel/card-overage-events
 *   - POST /api/v1/fuel/card-overage-events/:id/approve → approveAndPostFuelCardOverage
 *   - index.ts registers registerFuelCardOverageRoutes
 *   - banking.json BANK-F10 stays FAIL until live Neon density (no theater PASS)
 *
 *   node scripts/verify-bank-f10-fuel-overage-recovery-wired.mjs
 *   node scripts/verify-bank-f10-fuel-overage-recovery-wired.mjs --selftest
 *
 * TS2347: approve route must use untyped client.query + row cast (PoolClient).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-f10-fuel-overage-recovery-wired";

const FILES = {
  routes: "apps/backend/src/fuel/fuel-card-overage.routes.ts",
  index: "apps/backend/src/index.ts",
  engine: "apps/backend/src/fuel/fuel-card-overage.service.ts",
  bankingJson: "docs/module-completion/banking.json",
  dom06Guard: "scripts/verify-fuel-card-overage-driver-recovery.mjs",
  fuel03Guard: "scripts/verify-fuel-overage-engine.mjs",
};

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

function collectProblemsFromSources(sources) {
  const problems = [];
  const readSrc = (rel) => {
    if (sources && Object.prototype.hasOwnProperty.call(sources, rel)) return sources[rel];
    return read(rel);
  };

  const routes = readSrc(FILES.routes);
  const index = readSrc(FILES.index);
  const engine = readSrc(FILES.engine);
  const bankingRaw = readSrc(FILES.bankingJson);

  if (!routes) problems.push(`missing ${FILES.routes}`);
  if (!index) problems.push(`missing ${FILES.index}`);
  if (!engine) problems.push(`missing ${FILES.engine}`);
  if (!bankingRaw) problems.push(`missing ${FILES.bankingJson}`);

  if (routes) {
    if (!routes.includes('"/api/v1/fuel/card-overage-events"')) {
      problems.push(`${FILES.routes} must expose GET /api/v1/fuel/card-overage-events`);
    }
    if (!routes.includes('"/api/v1/fuel/card-overage-events/:id/approve"')) {
      problems.push(`${FILES.routes} must expose POST /api/v1/fuel/card-overage-events/:id/approve`);
    }
    if (!routes.includes("approveAndPostFuelCardOverage")) {
      problems.push(`${FILES.routes} must call approveAndPostFuelCardOverage (approve-then-recover)`);
    }
    if (!routes.includes('"/api/v1/fuel/card-overage-events/reprocess"')) {
      problems.push(`${FILES.routes} must expose POST /api/v1/fuel/card-overage-events/reprocess`);
    }
    if (!routes.includes("reprocessUnprocessedFuelOverages")) {
      problems.push(`${FILES.routes} must call reprocessUnprocessedFuelOverages`);
    }
    if (!routes.includes("fuel.fuel_card_overage_events")) {
      problems.push(`${FILES.routes} must read fuel.fuel_card_overage_events (canonical table)`);
    }
  }

  if (index) {
    if (!index.includes("registerFuelCardOverageRoutes")) {
      problems.push(`${FILES.index} must import and call registerFuelCardOverageRoutes`);
    }
  }

  if (engine && /createSettlementDeduction/.test(engine)) {
    problems.push(`${FILES.engine} must not auto-charge via createSettlementDeduction (FUEL-03 supersession)`);
  }

  if (bankingRaw) {
    let banking;
    try {
      banking = JSON.parse(bankingRaw);
    } catch {
      problems.push(`${FILES.bankingJson} must be valid JSON`);
      banking = null;
    }
    if (banking) {
      const item = banking.items?.find((i) => i.id === "BANK-F10");
      if (!item) {
        problems.push(`${FILES.bankingJson} must contain BANK-F10 item`);
      } else {
        const ev = String(item.evidence || "");
        const events = Number((ev.match(/events\s*=\s*(\d+)/i) || [])[1] || NaN);
        const posted = Number((ev.match(/posted\s*=\s*(\d+)/i) || [])[1] || NaN);
        const densityOk = Number.isFinite(events) && events >= 1 && Number.isFinite(posted) && posted >= 1;
        if (item.status === "PASS") {
          if (!densityOk) {
            problems.push("BANK-F10 PASS requires evidence citing events>=1 and posted>=1 (Neon lucia density)");
          }
        } else if (item.status === "HOLD") {
          if (!item.owner_hold || !item.tracker || !item.future_block) {
            problems.push("BANK-F10 HOLD requires owner_hold + tracker + future_block (Rule 24)");
          }
        } else if (item.status !== "FAIL") {
          problems.push(`BANK-F10 manifest status must be FAIL|HOLD|PASS (got ${item.status})`);
        }
      }
    }
  }

  for (const dep of [FILES.dom06Guard, FILES.fuel03Guard]) {
    if (!readSrc(dep)) problems.push(`missing companion guard ${dep}`);
  }

  return problems;
}

function collectProblems() {
  return collectProblemsFromSources(null);
}

function selftest() {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — shipped source not clean:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const realRoutes = read(FILES.routes);
  const realIndex = read(FILES.index);
  const realBanking = read(FILES.bankingJson);

  const mutations = [
    {
      name: "approve route removed",
      sources: {
        [FILES.routes]: realRoutes.replaceAll('"/api/v1/fuel/card-overage-events/:id/approve"', '"X"'),
        [FILES.index]: realIndex,
        [FILES.bankingJson]: realBanking,
      },
    },
    {
      name: "index mount removed",
      sources: {
        [FILES.routes]: realRoutes,
        [FILES.index]: realIndex.replaceAll("registerFuelCardOverageRoutes", "noopFuelCardOverageRoutes"),
        [FILES.bankingJson]: realBanking,
      },
    },
    {
      name: "theater PASS on manifest",
      sources: {
        [FILES.routes]: realRoutes,
        [FILES.index]: realIndex,
        [FILES.bankingJson]: realBanking
          .replace(/("id": "BANK-F10"[\s\S]*?"status": )"(FAIL|HOLD|PASS)"/, '$1"PASS"')
          .replace(
            /("id": "BANK-F10"[\s\S]*?"evidence":\s*")[^"]*(")/,
            "$1theater pass no density cite$2"
          ),
      },
    },
  ];

  const inert = [];
  for (const m of mutations) {
    let changed = false;
    for (const [rel, mutated] of Object.entries(m.sources)) {
      if (mutated !== read(rel)) changed = true;
    }
    if (!changed) {
      inert.push(`${m.name}: mutation INERT`);
      continue;
    }
    if (collectProblemsFromSources(m.sources).length === 0) inert.push(`${m.name}: NOT CAUGHT`);
  }

  if (inert.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const e of inert) console.error("  - " + e);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST OK — route wiring + manifest honesty enforced`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — FUEL-03 approve/reprocess mounted; BANK-F10 FAIL|HOLD|density-PASS`);
}
