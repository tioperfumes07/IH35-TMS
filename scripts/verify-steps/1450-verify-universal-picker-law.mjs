export default {
  name: "verify:universal-picker-law",
  run(ctx) {
    ctx.run("node", ["scripts/verify-universal-picker-law.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-universal-picker-law.mjs"]);
  },
};
