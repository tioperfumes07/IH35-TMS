#!/usr/bin/env node
/**
 * BANK-F10 — Fuel card overage operator queue UI (DOD-A / VERIFY-1).
 *
 * Backend approve routes were mounted; operators still had no reachable Fuel surface.
 * Asserts:
 *   - /fuel/card-overage route → CardOverageQueuePage
 *   - Page calls GET /api/v1/fuel/card-overage-events + POST .../approve
 *   - Fuel Home KPI links to /fuel/card-overage
 *   - banking.json BANK-F10 stays FAIL (Rule 23 — no density theater)
 *
 * Cursor even claim: verify-step 1768.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-f10-overage-queue-ui";

const FILES = {
  page: "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx",
  home: "apps/frontend/src/pages/fuel/FuelHome.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  bankingJson: "docs/module-completion/banking.json",
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

  const page = readSrc(FILES.page);
  const home = readSrc(FILES.home);
  const manifest = readSrc(FILES.manifest);
  const bankingRaw = readSrc(FILES.bankingJson);

  if (!page) problems.push(`missing ${FILES.page}`);
  if (!home) problems.push(`missing ${FILES.home}`);
  if (!manifest) problems.push(`missing ${FILES.manifest}`);
  if (!bankingRaw) problems.push(`missing ${FILES.bankingJson}`);

  if (page) {
    if (!page.includes("/api/v1/fuel/card-overage-events")) {
      problems.push(`${FILES.page} must call GET /api/v1/fuel/card-overage-events`);
    }
    if (!page.includes("/approve") || !page.includes("method: \"POST\"")) {
      problems.push(`${FILES.page} must POST .../approve for recovery`);
    }
    if (!page.includes("data-testid=\"fuel-card-overage-queue\"")) {
      problems.push(`${FILES.page} must expose data-testid=fuel-card-overage-queue`);
    }
  }

  if (home) {
    if (!home.includes('to="/fuel/card-overage"') || !home.includes("FuelCardOverageKpiCard")) {
      problems.push(`${FILES.home} must link Fuel Home KPI to /fuel/card-overage`);
    }
    if (!home.includes("pendingLoaded = pendingQuery.data !== undefined") || !home.includes('pendingLoaded ? pending : "…"')) {
      problems.push(`${FILES.home} must distinguish unresolved overage count from a true zero`);
    }
  }

  if (manifest) {
    if (!manifest.includes('path="/fuel/card-overage"') || !manifest.includes("CardOverageQueuePage")) {
      problems.push(`${FILES.manifest} must mount /fuel/card-overage → CardOverageQueuePage`);
    }
  }

  if (bankingRaw) {
    try {
      const banking = JSON.parse(bankingRaw);
      const item = banking.items?.find((i) => i.id === "BANK-F10");
      if (!item) problems.push(`${FILES.bankingJson} must contain BANK-F10`);
      else {
        const ev = String(item.evidence ?? "");
        const events = Number((ev.match(/events\s*=\s*(\d+)/i) || [])[1] || NaN);
        const posted = Number((ev.match(/posted\s*=\s*(\d+)/i) || [])[1] || NaN);
        const densityOk = Number.isFinite(events) && events >= 1 && Number.isFinite(posted) && posted >= 1;
        const uiOk = /card-overage|CardOverage|queue UI/i.test(ev);
        if (item.status === "PASS") {
          if (!densityOk) problems.push("BANK-F10 PASS requires events>=1 and posted>=1 in evidence");
          if (!uiOk) problems.push("BANK-F10 PASS evidence must note Fuel card-overage queue UI mounted");
        } else if (item.status === "HOLD") {
          if (!item.owner_hold || !item.tracker || !item.future_block) {
            problems.push("BANK-F10 HOLD requires owner_hold + tracker + future_block (Rule 24)");
          }
          if (!uiOk) problems.push("BANK-F10 HOLD evidence must note Fuel card-overage queue UI mounted");
        } else if (item.status !== "FAIL") {
          problems.push(`BANK-F10 must be FAIL|HOLD|PASS (got ${item.status})`);
        } else if (!uiOk) {
          problems.push("BANK-F10 evidence must note Fuel card-overage queue UI mounted");
        }
      }
    } catch {
      problems.push(`${FILES.bankingJson} must be valid JSON`);
    }
  }

  return problems;
}

function selftest() {
  const baseline = collectProblemsFromSources(null);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL — shipped source not clean:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const realPage = read(FILES.page);
  const realHome = read(FILES.home);
  const realManifest = read(FILES.manifest);
  const realBanking = read(FILES.bankingJson);

  const mutations = [
    {
      name: "route unmounted",
      sources: {
        [FILES.page]: realPage,
        [FILES.home]: realHome,
        [FILES.manifest]: realManifest.replaceAll('path="/fuel/card-overage"', 'path="/fuel/x"'),
        [FILES.bankingJson]: realBanking,
      },
    },
    {
      name: "home link removed",
      sources: {
        [FILES.page]: realPage,
        [FILES.home]: realHome.replaceAll('to="/fuel/card-overage"', 'to="/fuel/x"'),
        [FILES.manifest]: realManifest,
        [FILES.bankingJson]: realBanking,
      },
    },
    {
      name: "loading state paints a false zero",
      sources: {
        [FILES.page]: realPage,
        [FILES.home]: realHome.replace('pendingLoaded ? pending : "…"', "pending"),
        [FILES.manifest]: realManifest,
        [FILES.bankingJson]: realBanking,
      },
    },
    {
      name: "theater PASS",
      sources: {
        [FILES.page]: realPage,
        [FILES.home]: realHome,
        [FILES.manifest]: realManifest,
        [FILES.bankingJson]: realBanking
          .replace(/("id": "BANK-F10"[\s\S]*?"status": )"(FAIL|HOLD|PASS)"/, '$1"PASS"')
          .replace(
            /("id": "BANK-F10"[\s\S]*?"evidence":\s*")[^"]*(")/,
            "$1theater pass no density$2"
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
  console.log(`${LABEL} SELFTEST OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const problems = collectProblemsFromSources(null);
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — /fuel/card-overage queue UI mounted; BANK-F10 FAIL/HOLD until density`);
}
