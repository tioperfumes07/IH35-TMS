export default {
  name: "verify:safety-creator-pickers-2040",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-creator-pickers.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-creator-pickers.mjs"]);
  },
};
