export default {
  name: "verify:legal-reverse-drill-fleet-insurance",
  run(ctx) {
    ctx.run("node", ["scripts/verify-legal-reverse-drill-fleet-insurance.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-legal-reverse-drill-fleet-insurance.mjs"]);
  },
};
