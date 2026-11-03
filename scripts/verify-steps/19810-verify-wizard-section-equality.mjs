export default {
  name: "verify:wizard-section-equality",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wizard-section-equality.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-wizard-section-equality.mjs"]);
  },
};
