// A-08 (Lead's NEXT-15-JOBS order, 2026-09-30) -- this guard passed today but ran nowhere (orphan).
// It is the guard that keeps every NEW money table WORM-covered; wiring it in closes that gap.
export default {
  name: "verify:new-financial-table-ships-worm",
  run(ctx) {
    ctx.run("node", ["scripts/verify-new-financial-table-ships-worm.mjs"]);
  },
};
