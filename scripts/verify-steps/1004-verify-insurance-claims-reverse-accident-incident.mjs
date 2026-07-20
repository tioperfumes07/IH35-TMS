export default {
  name: "verify:insurance-claims-reverse-accident-incident",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-claims-reverse-accident-incident.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-insurance-claims-reverse-accident-incident.mjs"]);
  },
};
