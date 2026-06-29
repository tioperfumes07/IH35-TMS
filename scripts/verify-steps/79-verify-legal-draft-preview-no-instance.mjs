import fs from "node:fs";
import path from "node:path";

// Legal Phase 3 invariant: the watermarked DRAFT preview is preview/print ONLY and must
// create NO contract instance (and no DB writes at all). A draft must never persist.
// This guards against a regression where the preview path starts inserting rows.

const PREVIEW_FILE = "apps/backend/src/legal/draft-preview.service.ts";

export default {
  name: "verify-legal-draft-preview-no-instance",
  run: async () => {
    const file = path.resolve(PREVIEW_FILE);
    if (!fs.existsSync(file)) {
      console.error(`verify-legal-draft-preview-no-instance FAILED — missing ${PREVIEW_FILE}`);
      process.exit(1);
    }
    const src = fs.readFileSync(file, "utf8");

    // No INSERT/UPDATE/DELETE of any legal table from the preview service.
    const WRITE_RE = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(legal|safety|accounting|documents|driver_finance|events)\./gi;
    const hits = src.match(WRITE_RE);
    if (hits && hits.length) {
      console.error(
        "verify-legal-draft-preview-no-instance FAILED — the draft preview performs DB writes:\n  " +
          hits.join("\n  ") +
          "\nA draft preview must be read-only (no instance row)."
      );
      process.exit(1);
    }
    // Belt-and-suspenders: explicitly ban the instance insert.
    if (/INSERT\s+INTO\s+legal\.contract_instances/i.test(src)) {
      console.error("verify-legal-draft-preview-no-instance FAILED — draft preview inserts a contract instance.");
      process.exit(1);
    }
    console.log("verify-legal-draft-preview-no-instance OK — preview is read-only; creates no instance.");
  },
};
