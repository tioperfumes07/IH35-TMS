import fs from "node:fs";
import path from "node:path";

// SAFETY FINE-GL HOP — regression guard for the COMPANY-PAID civil-fine expense leg.
//
// THE DEFECT THIS ASSERTS (it was real on main before this guard shipped):
// safety.civil_fines has two owner-decided treatments. The DRIVER-RECOVERY one was built —
// POST /api/v1/safety/fines/:id/convert-to-liability inserts a driver_finance.driver_liabilities row
// and seeds a settlement deduction. The COMPANY-PAID one was NOT: POST /api/v1/safety/fines/:id/
// link-payment only stamped paid_via_bank_transaction_id / paid_date / paid_amount_cents /
// status='paid' on the fine row. No journal entry, no ledger row, no account. A fine the company ate
// reached NO LEDGER AT ALL — cash left the bank and the P&L never saw the expense.
//
// This guard fails the build if that hop is removed, un-gated, or re-implemented with hand-rolled GL:
//   1. the company-paid poster module exists;
//   2. it is FLAG-GATED and the flag key is registered as a per-entity posting flag;
//   3. it REUSES the shared poster (createJournalEntry) and the ROLE resolver (resolveRoleAccount)
//      — and hand-rolls NO debit/credit derivation;
//   4. it resolves the expense account by ROLE (civil_fines_expense), never by account number/name;
//   5. civil_fines_expense has NO shape-fallback (it must fail closed until the owner designates);
//   6. the link-payment route actually CALLS the poster (the hop is wired, not merely written);
//   7. the fine carries the JE linkage column so fine <-> JE drill-through exists both ways;
//   8. driver-recovery fines are refused by the company-paid leg (no double-count).

const POSTER = "apps/backend/src/accounting/safety-fine-posting/poster.service.ts";
const FINES_ROUTES = "apps/backend/src/safety/fines.routes.ts";
const RESOLVER = "apps/backend/src/accounting/coa-roles/resolver.service.ts";
const FLAGS = "apps/backend/src/lib/feature-flags/service.ts";
const MIGRATIONS_DIR = "db/migrations";

const FLAG_KEY = "SAFETY_FINE_GL_POSTING_ENABLED";
const ROLE_KEY = "civil_fines_expense";

function read(rel) {
  const abs = path.resolve(rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

// Strip // and /* */ comments so the hand-rolled-GL scan tests real CODE, not prose. Without this a
// comment that merely EXPLAINS the rule ("createJournalEntry enforces debits === credits") would trip
// the very guard documenting it.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export default {
  name: "verify-safety-fine-company-paid-posts-gl",
  run: async () => {
    const failures = [];

    // ── 1. the poster module exists ────────────────────────────────────────────────────────────────
    const poster = read(POSTER);
    if (!poster) {
      failures.push(
        `${POSTER} is MISSING — the company-paid civil-fine expense hop does not exist. A fine the ` +
          `company eats reaches no ledger at all.`
      );
    }

    if (poster) {
      // ── 2. flag-gated ────────────────────────────────────────────────────────────────────────────
      if (!poster.includes(FLAG_KEY)) {
        failures.push(`${POSTER}: missing the ${FLAG_KEY} gate — every posting must be flag-gated.`);
      }
      if (!/\bisEnabled\s*\(/.test(poster)) {
        failures.push(
          `${POSTER}: does not call isEnabled(...) — the flag must be read per-entity at runtime, ` +
            `never as a global env read.`
        );
      }
      if (!/flag_off/.test(poster)) {
        failures.push(`${POSTER}: no flag_off short-circuit — flag OFF must mean ZERO writes.`);
      }

      // ── 3. reuses the shared poster + writes no new GL math ──────────────────────────────────────
      if (!/\bcreateJournalEntry\b/.test(poster)) {
        failures.push(
          `${POSTER}: does not call createJournalEntry — the hop MUST reuse the shared posting engine, ` +
            `not write its own ledger insert.`
        );
      }
      // Hand-rolled GL detection: a balancing/derivation loop has no business in a poster that reuses
      // the engine. createJournalEntry already asserts debits === credits > 0.
      const handRolled = [
        { re: /INSERT\s+INTO\s+accounting\.journal_entry_lines/i, why: "direct journal_entry_lines INSERT (bypasses the shared poster)" },
        { re: /INSERT\s+INTO\s+accounting\.journal_entries/i, why: "direct journal_entries INSERT (bypasses the shared poster)" },
        { re: /debits\s*(===|==|!==|!=)\s*credits/, why: "hand-rolled balance assertion (createJournalEntry already does this)" },
        { re: /\.reduce\s*\([^)]*debit/i, why: "hand-rolled debit summation (GL math)" },
      ];
      const posterCode = stripComments(poster);
      for (const { re, why } of handRolled) {
        if (re.test(posterCode)) {
          failures.push(`${POSTER}: hand-rolled GL detected — ${why}.`);
        }
      }

      // ── 4. account resolved by ROLE, never by number/name ────────────────────────────────────────
      if (!/\bresolveRoleAccount\s*\(/.test(poster)) {
        failures.push(
          `${POSTER}: does not call resolveRoleAccount — the expense account must resolve by ROLE ` +
            `through the existing role resolver, never by a hardcoded account number or name lookup.`
        );
      }
      if (!poster.includes(ROLE_KEY)) {
        failures.push(`${POSTER}: does not resolve the ${ROLE_KEY} role.`);
      }
      // A hardcoded 4-digit GL account number literal in a poster is the exact anti-pattern.
      const hardcodedAcct = poster.match(/account_number\s*[=:]\s*["'][0-9]{3,}["']/);
      if (hardcodedAcct) {
        failures.push(`${POSTER}: hardcoded account number ${hardcodedAcct[0]} — resolve by role instead.`);
      }
      if (/account_name\s*=\s*\$/.test(poster) || /WHERE\s+a?\.?account_name\s*=/i.test(poster)) {
        failures.push(`${POSTER}: resolves an account by NAME lookup — must resolve by role.`);
      }

      // ── 8. driver-recovery fines refused (no double-count) ───────────────────────────────────────
      if (!/converted_to_liability_id/.test(poster)) {
        failures.push(
          `${POSTER}: does not check converted_to_liability_id — a driver-recovery fine is the DRIVER's ` +
            `debt (driver_liabilities + settlement deduction) and must NEVER also be expensed by the ` +
            `company-paid leg, or the cost is double-counted.`
        );
      }
    }

    // ── 5. the role must fail CLOSED — no shape-fallback ────────────────────────────────────────────
    const resolver = read(RESOLVER);
    if (!resolver) {
      failures.push(`${RESOLVER} is MISSING.`);
    } else {
      if (!resolver.includes(`"${ROLE_KEY}"`)) {
        failures.push(`${RESOLVER}: COA_ROLE_VALUES missing ${ROLE_KEY} — the role is not designatable.`);
      }
      const fallbackBlock = resolver.match(/const ROLE_FALLBACKS[\s\S]*?\n\};/);
      if (fallbackBlock && fallbackBlock[0].includes(ROLE_KEY)) {
        failures.push(
          `${RESOLVER}: ${ROLE_KEY} has a ROLE_FALLBACKS shape-fallback entry. A penalties/fines account ` +
            `must be DESIGNATED by the owner, never shape-matched by name or subtype. Remove the fallback ` +
            `so the role fails closed until designated.`
        );
      }
    }

    // ── 2b. flag registered as a per-entity posting flag ────────────────────────────────────────────
    const flags = read(FLAGS);
    if (!flags) {
      failures.push(`${FLAGS} is MISSING.`);
    } else if (!flags.includes(FLAG_KEY)) {
      failures.push(
        `${FLAGS}: ${FLAG_KEY} not enrolled in POSTING_FLAG_KEYS — without it a global rollout/default ` +
          `flip could turn fine posting on for EVERY entity (incl. USMCA / TRK), bypassing the ` +
          `per-entity money kill-switch.`
      );
    }

    // ── 6. the hop is WIRED — link-payment actually calls the poster ────────────────────────────────
    const routes = read(FINES_ROUTES);
    if (!routes) {
      failures.push(`${FINES_ROUTES} is MISSING.`);
    } else {
      const hasLinkPayment = /fines\/:id\/link-payment/.test(routes);
      if (!hasLinkPayment) {
        failures.push(`${FINES_ROUTES}: the link-payment route is gone — cannot verify the company-paid hop.`);
      }
      if (!/postCompanyPaidCivilFine\s*\(/.test(routes)) {
        failures.push(
          `${FINES_ROUTES}: the company-paid GL hop is NOT WIRED. link-payment records that the company ` +
            `paid the fine but never calls postCompanyPaidCivilFine, so the expense reaches no ledger. ` +
            `This is the original defect.`
        );
      }
      // The driver-recovery half must remain intact (additive-only; never regress the built rail).
      if (!/convert-to-liability/.test(routes) || !/driver_liabilities/.test(routes)) {
        failures.push(
          `${FINES_ROUTES}: the DRIVER-RECOVERY rail (convert-to-liability -> driver_liabilities) was ` +
            `removed. Both treatments must coexist.`
        );
      }
    }

    // ── 7. fine <-> JE linkage column shipped in a migration ────────────────────────────────────────
    const migDir = path.resolve(MIGRATIONS_DIR);
    let linkageFound = false;
    let flagSeededOff = false;
    if (fs.existsSync(migDir)) {
      for (const f of fs.readdirSync(migDir).filter((n) => n.endsWith(".sql"))) {
        const sql = fs.readFileSync(path.join(migDir, f), "utf8");
        if (/expense_je_id/.test(sql) && /safety\.civil_fines/.test(sql)) linkageFound = true;
        if (sql.includes(FLAG_KEY) && /\bfalse\b/i.test(sql)) flagSeededOff = true;
      }
    }
    if (!linkageFound) {
      failures.push(
        `${MIGRATIONS_DIR}: no migration adds safety.civil_fines.expense_je_id — without it a posted fine ` +
          `has no forward/reverse drill-through to its journal entry, and the poster has no idempotency latch.`
      );
    }
    if (!flagSeededOff) {
      failures.push(
        `${MIGRATIONS_DIR}: no migration registers ${FLAG_KEY} with default_enabled = false. Every posting ` +
          `flag must be seeded DEFAULT OFF.`
      );
    }
    // Explicitly assert nobody seeded the flag ON.
    if (fs.existsSync(migDir)) {
      for (const f of fs.readdirSync(migDir).filter((n) => n.endsWith(".sql"))) {
        const sql = fs.readFileSync(path.join(migDir, f), "utf8");
        if (!sql.includes(FLAG_KEY)) continue;
        const onSeed = new RegExp(`'${FLAG_KEY}'[\\s\\S]{0,600}?\\btrue\\b`, "i");
        if (onSeed.test(sql)) {
          failures.push(`${MIGRATIONS_DIR}/${f}: ${FLAG_KEY} appears to be seeded TRUE. It must default OFF.`);
        }
      }
    }

    if (failures.length) {
      console.error(
        "verify-safety-fine-company-paid-posts-gl FAILED — the COMPANY-PAID civil-fine expense hop is " +
          "missing, un-gated, or hand-rolls GL:\n  " +
          failures.map((f) => "✗ " + f).join("\n  ")
      );
      process.exit(1);
    }

    console.log(
      "verify-safety-fine-company-paid-posts-gl OK — company-paid civil fines post Dr civil_fines_expense / " +
        "Cr cash_clearing via the shared createJournalEntry poster, resolved by role, gated by " +
        `${FLAG_KEY} (default OFF), linked to the fine via expense_je_id; driver-recovery fines are refused.`
    );
  },
};
