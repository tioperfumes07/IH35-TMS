import path from "node:path";

/**
 * CI's frontend test gate. It runs a NAMED LIST, not the suite — measured 2026-08-07: this step ran
 * exactly ONE of the 335 frontend test files, while a full `npx vitest run` in apps/frontend reports
 * 72 failed files / 166 failed tests. So the frontend is effectively ungated, and that is how a
 * render-top crash (LV-DRIVER-DETAIL-PAGE-CRASHES) reached production with every required check green.
 *
 * Turning the whole suite on here is NOT this block's call — it would redden CI on 72 pre-existing
 * failures spanning every lane. That is boarded as its own item. What IS in scope: a test written to
 * guard a P0 must actually RUN. A test CI does not execute is not a guard.
 */
const FILES = [
  "src/components/ErrorBoundary.test.tsx",
  // DQF-P0 — pins the CURP date-of-birth decode (century from position 17, not a year window) and the
  // cross-check that surfaces a CURP/DOB disagreement instead of saving a NULL date of birth.
  "src/lib/curp-dob.test.ts",
];

export default {
  name: "frontend-vitest",
  run: async (ctx) => {
    if (ctx.run("npx", ["vitest", "run", ...FILES], { cwd: path.join(ctx.ROOT, "apps/frontend") }) !== 0) {
      process.exit(1);
    }
  },
};
