export default {
  name: "verify-mgmt-report-aging-drill",
  run(ctx) {
    ctx.run("node", ["scripts/verify-mgmt-report-aging-drill.mjs"]);
    ctx.run("node", ["scripts/verify-mgmt-report-aging-drill.mjs", "--selftest"]);
  },
};
