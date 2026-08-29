export default {
  name: "verify:banking-p7-wave2-no-fake-success",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-p7-wave2-no-fake-success.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-p7-wave2-no-fake-success.mjs"]);
  },
};
