// A-09 (Lead's NEXT-15-JOBS order, 2026-09-30) -- this guard passed today but ran nowhere (orphan).
export default {
  name: "verify:check-stock-allocator",
  run(ctx) {
    ctx.run("node", ["scripts/verify-check-stock-allocator.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-check-stock-allocator.mjs"]);
  },
};
