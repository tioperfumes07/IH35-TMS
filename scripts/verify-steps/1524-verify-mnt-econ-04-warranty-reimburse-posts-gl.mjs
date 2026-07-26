import fs from "node:fs";
import path from "node:path";

const POSTER = "apps/backend/src/accounting/warranty-posting/poster.service.ts";
const ROUTES = "apps/backend/src/maintenance/warranty.routes.ts";
const RESOLVER = "apps/backend/src/accounting/coa-roles/resolver.service.ts";
const FLAGS = "apps/backend/src/lib/feature-flags/service.ts";
const MIGRATIONS_DIR = "db/migrations";
const FLAG_KEY = "WARRANTY_REIMBURSE_GL_POSTING_ENABLED";
const ROLE_KEY = "warranty_recovery";

function read(rel) {
  const abs = path.resolve(rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export default {
  name: "verify-mnt-econ-04-warranty-reimburse-posts-gl",
  run: async () => {
    const failures = [];
    const poster = read(POSTER);
    if (!poster) failures.push(`${POSTER} MISSING — warranty reimburse reaches no ledger (MNT-ECON-04).`);
    if (poster) {
      if (!poster.includes(FLAG_KEY)) failures.push(`${POSTER}: missing ${FLAG_KEY}`);
      if (!/\bisEnabled\s*\(/.test(poster)) failures.push(`${POSTER}: no isEnabled`);
      if (!/flag_off/.test(poster)) failures.push(`${POSTER}: no flag_off`);
      if (!/\bcreateJournalEntry\b/.test(poster)) failures.push(`${POSTER}: must call createJournalEntry`);
      if (!/\bresolveRoleAccount\s*\(/.test(poster) || !poster.includes(ROLE_KEY)) {
        failures.push(`${POSTER}: must resolve ${ROLE_KEY}`);
      }
      const code = stripComments(poster);
      if (/INSERT\s+INTO\s+accounting\.journal_entries/i.test(code)) {
        failures.push(`${POSTER}: hand-rolled journal_entries INSERT`);
      }
      if (!/accounting\.warranty_reimburse_postings/.test(poster)) {
        failures.push(`${POSTER}: never writes warranty_reimburse_postings`);
      }
    }
    const resolver = read(RESOLVER);
    if (!resolver?.includes(`"${ROLE_KEY}"`)) failures.push(`${RESOLVER}: missing ${ROLE_KEY}`);
    else {
      const fb = resolver.match(/const ROLE_FALLBACKS[\s\S]*?\n\};/);
      if (fb && fb[0].includes(ROLE_KEY)) failures.push(`${RESOLVER}: ${ROLE_KEY} must not have ROLE_FALLBACKS`);
    }
    const flags = read(FLAGS);
    if (!flags?.includes(FLAG_KEY)) failures.push(`${FLAGS}: ${FLAG_KEY} not in POSTING_FLAG_KEYS`);
    const routes = read(ROUTES);
    if (!routes) failures.push(`${ROUTES} MISSING`);
    else if (!/postWarrantyReimbursement\s*\(/.test(routes)) {
      failures.push(`${ROUTES}: reimburse does not call postWarrantyReimbursement`);
    }
    let linkage = false;
    let flagOff = false;
    const migDir = path.resolve(MIGRATIONS_DIR);
    for (const f of fs.readdirSync(migDir).filter((n) => n.endsWith(".sql"))) {
      const sql = fs.readFileSync(path.join(migDir, f), "utf8");
      if (/accounting\.warranty_reimburse_postings/.test(sql) && /expense_je_id/.test(sql)) linkage = true;
      if (sql.includes(FLAG_KEY) && /\bfalse\b/i.test(sql)) flagOff = true;
    }
    if (!linkage) failures.push("no migration creates accounting.warranty_reimburse_postings");
    if (!flagOff) failures.push(`${FLAG_KEY} not seeded default false`);
    if (failures.length) {
      console.error(
        "verify-mnt-econ-04-warranty-reimburse-posts-gl FAILED:\n  " +
          failures.map((f) => "✗ " + f).join("\n  ")
      );
      process.exit(1);
    }
    console.log(
      `verify-mnt-econ-04-warranty-reimburse-posts-gl OK — ${FLAG_KEY} / ${ROLE_KEY} / createJournalEntry wired.`
    );
  },
};
