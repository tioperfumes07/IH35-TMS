export default {
  name: "verify:verify-driver-endpoints-set-based",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-endpoints-set-based.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-endpoints-set-based.mjs"]);
  },
};
