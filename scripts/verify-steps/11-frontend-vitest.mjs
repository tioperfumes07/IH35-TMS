import path from "node:path";

/**
 * CI's frontend test gate. It runs a NAMED LIST, not the suite — measured 2026-08-07: this step ran
 * exactly ONE of the 335 frontend test files, while a full `npx vitest run` in apps/frontend reports
 * 72 failed files / 166 failed tests. So the frontend is effectively ungated, and that is precisely
 * how LV-DRIVER-DETAIL-PAGE-CRASHES (P0) shipped: the driver profile threw at render-top and no CI
 * check could have noticed.
 *
 * Turning the whole suite on here is NOT this block's call — it would redden CI on 72 pre-existing
 * failures spanning every lane. That is boarded as its own item. What IS in scope: a regression test
 * for a P0 must actually RUN, so it is added to the list. A test CI does not execute is not a guard.
 */
const FILES = [
  "src/components/ErrorBoundary.test.tsx",
  // LV-DRIVER-DETAIL-PAGE-CRASHES — pins that getDriver unwraps the aggregate envelope, so the
  // driver profile can never again bind `undefined` fields and throw on a formatter at render-top.
  "src/api/get-driver-aggregate-unwrap.test.ts",
];

export default {
  name: "frontend-vitest",
  run: async (ctx) => {
    if (ctx.run("npx", ["vitest", "run", ...FILES], { cwd: path.join(ctx.ROOT, "apps/frontend") }) !== 0) {
      process.exit(1);
    }
  },
};
