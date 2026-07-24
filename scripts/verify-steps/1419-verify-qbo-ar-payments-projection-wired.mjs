export default {
  name: "verify:qbo-ar-payments-projection-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-ar-payments-projection-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-ar-payments-projection-wired.mjs"]);
  },
};
