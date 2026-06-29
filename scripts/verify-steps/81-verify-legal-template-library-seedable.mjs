import { execFileSync } from "node:child_process";
import path from "node:path";

// LEGAL-SEED-01: run the standalone seedable guard (single source of truth in
// scripts/verify-legal-template-library-seedable.mjs) as a verify:pre-commit step so it gates CI.

export default {
  name: "verify-legal-template-library-seedable",
  run: async () => {
    const script = path.resolve(process.cwd(), "scripts/verify-legal-template-library-seedable.mjs");
    try {
      execFileSync(process.execPath, [script], { stdio: "inherit" });
    } catch {
      process.exit(1);
    }
  },
};
