export default {
  name: "verify-block-ready-retirement",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-block-ready-retirement.mjs"]) !== 0) {
      process.exit(1);
    }
    if (ctx.run("node", ["scripts/verify-block-ready-retirement.mjs", "--selftest"]) !== 0) {
      process.exit(1);
    }
  },
};
