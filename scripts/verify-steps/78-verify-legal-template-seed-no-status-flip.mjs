import fs from "node:fs";
import path from "node:path";

// Legal Phase 2 invariant: seeding the template library must NEVER flip an EXISTING
// template's status (the 19 pre-existing templates, or any already-seeded library row).
// The seed MUST be ON CONFLICT (operating_company_id, template_code, version) DO NOTHING
// — never DO UPDATE (which could mutate status/body of an existing row).

const SEED_FILE = "apps/backend/src/legal/template-library.service.ts";

export default {
  name: "verify-legal-template-seed-no-status-flip",
  run: async () => {
    const file = path.resolve(SEED_FILE);
    if (!fs.existsSync(file)) {
      console.error(`verify-legal-template-seed-no-status-flip FAILED — missing ${SEED_FILE}`);
      process.exit(1);
    }
    const src = fs.readFileSync(file, "utf8");

    if (!/ON CONFLICT\s*\(operating_company_id,\s*template_code,\s*version\)\s*DO NOTHING/i.test(src)) {
      console.error(
        "verify-legal-template-seed-no-status-flip FAILED — the library seed must upsert with " +
          "ON CONFLICT (operating_company_id, template_code, version) DO NOTHING."
      );
      process.exit(1);
    }
    // Ban any DO UPDATE in the seed (would let a re-seed mutate an existing row).
    if (/ON CONFLICT[\s\S]{0,120}DO UPDATE/i.test(src)) {
      console.error(
        "verify-legal-template-seed-no-status-flip FAILED — the seed uses DO UPDATE; a re-seed must " +
          "not mutate existing templates. Use DO NOTHING."
      );
      process.exit(1);
    }
    // Ban any UPDATE of contract_templates status from the seed file (status changes are the
    // lifecycle service's job, never the seed's).
    if (/UPDATE\s+legal\.contract_templates[\s\S]{0,200}status\s*=/i.test(src)) {
      console.error(
        "verify-legal-template-seed-no-status-flip FAILED — the seed file mutates contract_templates.status. " +
          "Status transitions belong to the lifecycle service, not the seed."
      );
      process.exit(1);
    }
    console.log("verify-legal-template-seed-no-status-flip OK — seed is DO NOTHING; no status mutation.");
  },
};
