export default {
  name: "verify-list-segment-tabs-present",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-list-segment-tabs-present.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-list-segment-tabs-present.mjs", "--selftest"]);
  },
};
