export default {
  name: "verify:integration-fixture-owner-bootstrap",
  run(ctx) {
    ctx.run("node", ["scripts/verify-integration-fixture-owner-bootstrap.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-integration-fixture-owner-bootstrap.mjs"]);
  },
};
