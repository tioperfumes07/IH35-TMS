export default {
  name: "verify:driver-termination-reasons-rls-single-policy",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-termination-reasons-rls-single-policy.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-termination-reasons-rls-single-policy.mjs"]);
  },
};
