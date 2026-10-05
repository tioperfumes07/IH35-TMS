export default {
  name: "verify:no-orphan-bookend-settlement-reuse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-orphan-bookend-settlement-reuse.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-orphan-bookend-settlement-reuse.mjs"]);
  },
};
