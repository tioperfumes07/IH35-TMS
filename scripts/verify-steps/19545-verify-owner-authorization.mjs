export default {
  name: "verify:owner-authorization",
  run(ctx) {
    ctx.run("node", ["scripts/verify-owner-authorization.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-owner-authorization.mjs"]);
  },
};
