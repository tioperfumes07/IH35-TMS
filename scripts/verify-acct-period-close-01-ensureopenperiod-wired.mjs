#!/usr/bin/env node
/**
 * ACCT-PERIOD-CLOSE-01 (owner packet TXH-05-TIME-AND-EDITABILITY-2026-08-29.md, board finding
 * ACCT-PERIOD-CLOSE-BLOCKS-UNIVERSAL-EDIT) -- static-shape guard.
 *
 * INVESTIGATION FINDING (not a build-from-scratch): the period-close control this board finding
 * described as "the single largest accounting-control gap... missing" was already fully built and
 * live -- a checklist-gated close/reopen UI (MonthClosePage.tsx), live backend routes
 * (month-close.routes.ts, p7-wave2.routes.ts's /periods/:id/close+reopen), per-entity feature
 * flags (both ON for all 3 entities), a shared app-level ensureOpenPeriod() guard already wired
 * into most posters, AND an independent DB-trigger backstop (migration 0183) on
 * invoices/bills/payments/bill_payments/journal_entries/journal_entry_postings that blocks a raw
 * INSERT into a closed period regardless of any application code path. Live-confirmed both layers
 * work by temporarily flipping a real period to 'closed' inside a rolled-back transaction. The
 * real, honest reason no period has ever closed: bank reconciliation has never reached 100%
 * coverage for any month (a genuine operational fact, not a code defect).
 *
 * What THIS PR actually fixes: 4 of the ~13 JE-insert choke points had NO app-level
 * ensureOpenPeriod() call at all (the DB trigger was still their only backstop) --
 * journal-entries.service.ts's manual/API create path (also the shared function 21+ other posters
 * funnel through), amortization-posting.service.ts's shared header insert, bank-recon/match.service.ts,
 * and recurring.worker.ts. Also consolidated fuel-posting/poster.service.ts's own drifted local
 * copy (silently failed OPEN on a closed_period_cutoff() query error instead of failing closed or
 * propagating, and threw a differently-shaped plain Error) onto the shared, correct implementation.
 */
import { readFileSync } from "node:fs";

const FILES = {
  journalEntries: "apps/backend/src/accounting/journal-entries.service.ts",
  amortization: "apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts",
  bankRecon: "apps/backend/src/accounting/bank-recon/match.service.ts",
  recurring: "apps/backend/src/accounting/recurring.worker.ts",
  fuel: "apps/backend/src/accounting/fuel-posting/poster.service.ts",
};

function analyze(src) {
  const failures = [];

  if (!/import\s*\{\s*ensureOpenPeriod\s*\}\s*from\s*"\.\/posting-engine\.service\.js"/.test(src.journalEntries)) {
    failures.push(`${FILES.journalEntries}: does not import ensureOpenPeriod from posting-engine.service.js`);
  }
  if (!/await ensureOpenPeriod\(client, input\.operating_company_id, input\.entry_date\)/.test(src.journalEntries)) {
    failures.push(`${FILES.journalEntries}: createJournalEntryOnClient does not call ensureOpenPeriod`);
  }

  if (!/import\s*\{\s*ensureOpenPeriod\s*\}\s*from\s*"\.\.\/posting-engine\.service\.js"/.test(src.amortization)) {
    failures.push(`${FILES.amortization}: does not import ensureOpenPeriod from posting-engine.service.js`);
  }
  if (!/await ensureOpenPeriod\(client, operatingCompanyId, entryDate\)/.test(src.amortization)) {
    failures.push(`${FILES.amortization}: insertJournalEntryHeader does not call ensureOpenPeriod`);
  }

  if (!/import\s*\{\s*ensureOpenPeriod\s*\}\s*from\s*"\.\.\/posting-engine\.service\.js"/.test(src.bankRecon)) {
    failures.push(`${FILES.bankRecon}: does not import ensureOpenPeriod from posting-engine.service.js`);
  }
  if (!/await ensureOpenPeriod\(client, input\.operating_company_id, input\.transaction_date\)/.test(src.bankRecon)) {
    failures.push(`${FILES.bankRecon}: does not call ensureOpenPeriod before the variance-JE insert`);
  }

  if (!/import\s*\{\s*ensureOpenPeriod\s*\}\s*from\s*"\.\/posting-engine\.service\.js"/.test(src.recurring)) {
    failures.push(`${FILES.recurring}: does not import ensureOpenPeriod from posting-engine.service.js`);
  }
  if (!/await ensureOpenPeriod\(client, oc, entryDate\)/.test(src.recurring)) {
    failures.push(`${FILES.recurring}: materializeJournal does not call ensureOpenPeriod`);
  }

  if (!/import\s*\{\s*ensureOpenPeriod,\s*resolvePostingTemplateId\s*\}\s*from\s*"\.\.\/posting-engine\.service\.js"/.test(src.fuel)) {
    failures.push(`${FILES.fuel}: does not import the shared ensureOpenPeriod (still has a local copy?)`);
  }
  if (/async function ensureOpenPeriod\(/.test(src.fuel)) {
    failures.push(`${FILES.fuel}: still defines its own local ensureOpenPeriod (drifted duplicate not removed)`);
  }
  if (!/await ensureOpenPeriod\(client, input\.operating_company_id, postingDate\)/.test(src.fuel)) {
    failures.push(`${FILES.fuel}: does not call the shared ensureOpenPeriod before posting`);
  }

  return failures;
}

function readAll() {
  return Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, readFileSync(path, "utf8")]));
}

function selftest() {
  const src = readAll();
  const good = analyze(src);
  if (good.length > 0) {
    console.error("verify-acct-period-close-01-ensureopenperiod-wired --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "journal-entries.service.ts loses the ensureOpenPeriod call",
      apply: (s) => ({ ...s, journalEntries: s.journalEntries.replace("await ensureOpenPeriod(client, input.operating_company_id, input.entry_date);", "") }),
    },
    {
      name: "amortization-posting.service.ts loses the ensureOpenPeriod call",
      apply: (s) => ({ ...s, amortization: s.amortization.replace("await ensureOpenPeriod(client, operatingCompanyId, entryDate);", "") }),
    },
    {
      name: "bank-recon/match.service.ts loses the ensureOpenPeriod call",
      apply: (s) => ({ ...s, bankRecon: s.bankRecon.replace("await ensureOpenPeriod(client, input.operating_company_id, input.transaction_date);", "") }),
    },
    {
      name: "recurring.worker.ts loses the ensureOpenPeriod call",
      apply: (s) => ({ ...s, recurring: s.recurring.replace("await ensureOpenPeriod(client, oc, entryDate);", "") }),
    },
    {
      name: "fuel-posting's local drifted copy reintroduced",
      apply: (s) => ({
        ...s,
        fuel: s.fuel.replace(
          "function normalizeFuelKind",
          `async function ensureOpenPeriod(client, operatingCompanyId, postingDate) {\n  const cutoff = await client.query("x").catch(() => ({ rows: [{ cutoff: null }] }));\n}\nfunction normalizeFuelKind`
        ),
      }),
    },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply(src);
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-acct-period-close-01-ensureopenperiod-wired --selftest: NOT CAUGHT -- ${m.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${m.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught and repository restored green.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const src = readAll();
  const failures = analyze(src);
  if (failures.length > 0) {
    console.error("verify-acct-period-close-01-ensureopenperiod-wired: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-acct-period-close-01-ensureopenperiod-wired: OK -- all 4 previously-missing JE-insert choke points call the shared ensureOpenPeriod; fuel-posting's drifted local copy consolidated onto the same shared, correct implementation"
  );
}
