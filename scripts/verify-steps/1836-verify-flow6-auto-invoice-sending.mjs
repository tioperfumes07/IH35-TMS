export default {
  name: "verify:flow6-auto-invoice-sending",
  run(ctx) {
    ctx.run("node", ["scripts/verify-flow6-auto-invoice-sending.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-flow6-auto-invoice-sending.mjs"]);
  },
};
