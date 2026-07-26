import fs from "node:fs";
import path from "node:path";

// MNT-ECON-01 — standalone parts purchase must create A/P bill + balanced JE via the shared poster.
// FOR-CURSOR 4 · GUARD-VERIFIED defect: parts-inventory.routes.ts purchases INSERT stock only.

const POSTER = "apps/backend/src/accounting/parts-inventory-posting/poster.service.ts";
const ROUTES = "apps/backend/src/maintenance/parts-inventory.routes.ts";
const RESOLVER = "apps/backend/src/accounting/coa-roles/resolver.service.ts";
const FLAGS = "apps/backend/src/lib/feature-flags/service.ts";
const MIGRATIONS_DIR = "db/migrations";

const FLAG_KEY = "PARTS_PURCHASE_GL_POSTING_ENABLED";
const ROLE_KEY = "maintenance_parts_expense";

function read(rel) {
  const abs = path.resolve(rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export default {
  name: "verify-mnt-econ-01-parts-purchase-posts-gl",
  run: async () => {
    const failures = [];

    const poster = read(POSTER);
    if (!poster) {
      failures.push(
        `${POSTER} is MISSING — standalone parts purchases reach no A/P bill and no ledger (MNT-ECON-01).`
      );
    }

    if (poster) {
      if (!poster.includes(FLAG_KEY)) {
        failures.push(`${POSTER}: missing the ${FLAG_KEY} gate.`);
      }
      if (!/\bisEnabled\s*\(/.test(poster)) {
        failures.push(`${POSTER}: does not call isEnabled(...) — flag must be read per-entity.`);
      }
      if (!/flag_off/.test(poster)) {
        failures.push(`${POSTER}: no flag_off short-circuit — flag OFF must mean ZERO bill/JE writes.`);
      }
      if (!/\bcreateBill\b/.test(poster) || !/\bpostSourceTransaction\b/.test(poster)) {
        failures.push(
          `${POSTER}: must reuse createBill + postSourceTransaction for the vendor/A/P path (no new GL math).`
        );
      }
      if (!/\bcreateJournalEntry\b/.test(poster)) {
        failures.push(`${POSTER}: cash path must call createJournalEntry (shared poster).`);
      }
      if (!/\bresolveRoleAccount\s*\(/.test(poster) || !poster.includes(ROLE_KEY)) {
        failures.push(`${POSTER}: must resolve ${ROLE_KEY} via resolveRoleAccount.`);
      }
      const posterCode = stripComments(poster);
      for (const { re, why } of [
        { re: /INSERT\s+INTO\s+accounting\.journal_entry_lines/i, why: "direct journal_entry_lines INSERT" },
        { re: /INSERT\s+INTO\s+accounting\.journal_entries/i, why: "direct journal_entries INSERT" },
      ]) {
        if (re.test(posterCode)) failures.push(`${POSTER}: hand-rolled GL — ${why}.`);
      }
      if (!/accounting\.parts_purchase_postings/.test(poster)) {
        failures.push(`${POSTER}: never writes accounting.parts_purchase_postings (linkage + idempotency).`);
      }
    }

    const resolver = read(RESOLVER);
    if (!resolver) failures.push(`${RESOLVER} is MISSING.`);
    else {
      if (!resolver.includes(`"${ROLE_KEY}"`)) {
        failures.push(`${RESOLVER}: COA_ROLE_VALUES missing ${ROLE_KEY}.`);
      }
      const fallbackBlock = resolver.match(/const ROLE_FALLBACKS[\s\S]*?\n\};/);
      if (fallbackBlock && fallbackBlock[0].includes(ROLE_KEY)) {
        failures.push(`${RESOLVER}: ${ROLE_KEY} must NOT have a ROLE_FALLBACKS shape-fallback.`);
      }
    }

    const flags = read(FLAGS);
    if (!flags) failures.push(`${FLAGS} is MISSING.`);
    else if (!flags.includes(FLAG_KEY)) {
      failures.push(`${FLAGS}: ${FLAG_KEY} not enrolled in POSTING_FLAG_KEYS.`);
    }

    const routes = read(ROUTES);
    if (!routes) failures.push(`${ROUTES} is MISSING.`);
    else {
      if (!/parts-inventory\/purchases/.test(routes)) {
        failures.push(`${ROUTES}: purchases route missing.`);
      }
      if (!/postPartsInventoryPurchase\s*\(/.test(routes)) {
        failures.push(
          `${ROUTES}: purchases route does NOT call postPartsInventoryPurchase — the economic hop is unwired.`
        );
      }
    }

    let linkageFound = false;
    let flagSeededOff = false;
    const migDir = path.resolve(MIGRATIONS_DIR);
    if (fs.existsSync(migDir)) {
      for (const f of fs.readdirSync(migDir).filter((n) => n.endsWith(".sql"))) {
        const sql = fs.readFileSync(path.join(migDir, f), "utf8");
        if (/accounting\.parts_purchase_postings/.test(sql) && /expense_je_id/.test(sql)) linkageFound = true;
        if (sql.includes(FLAG_KEY) && /\bfalse\b/i.test(sql)) flagSeededOff = true;
        if (!sql.includes(FLAG_KEY)) continue;
        if (new RegExp(`'${FLAG_KEY}'[\\s\\S]{0,600}?\\btrue\\b`, "i").test(sql)) {
          failures.push(`${MIGRATIONS_DIR}/${f}: ${FLAG_KEY} appears seeded TRUE — must default OFF.`);
        }
      }
    }
    if (!linkageFound) {
      failures.push(`${MIGRATIONS_DIR}: no migration creates accounting.parts_purchase_postings with expense_je_id.`);
    }
    if (!flagSeededOff) {
      failures.push(`${MIGRATIONS_DIR}: no migration registers ${FLAG_KEY} with default_enabled = false.`);
    }

    if (failures.length) {
      console.error(
        "verify-mnt-econ-01-parts-purchase-posts-gl FAILED:\n  " +
          failures.map((f) => "✗ " + f).join("\n  ")
      );
      process.exit(1);
    }
    console.log(
      "verify-mnt-econ-01-parts-purchase-posts-gl OK — parts purchases wire createBill/postSourceTransaction/" +
        `createJournalEntry behind ${FLAG_KEY} (default OFF), role ${ROLE_KEY}, linkage ledger present.`
    );
  },
};
