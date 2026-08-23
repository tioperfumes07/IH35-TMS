export default {
  name: "verify:driver-audit-shared-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-audit-shared-reverse.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-audit-shared-reverse.mjs"]);
  },
};
