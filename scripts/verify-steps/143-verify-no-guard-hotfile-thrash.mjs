export default {
  name: "verify-no-guard-hotfile-thrash",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-no-guard-hotfile-thrash.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
