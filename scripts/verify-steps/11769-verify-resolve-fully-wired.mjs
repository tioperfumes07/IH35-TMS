// A-09 (Lead's NEXT-15-JOBS order, 2026-09-30) -- this guard passed today but ran nowhere (orphan).
export default {
  name: "verify:resolve-fully-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-resolve-fully-wired.mjs"]);
  },
};
