// verify-steps wrapper — LV-DEAD-SEEDED-FLAGS · claim 3630
export default {
  name: "verify-dead-seeded-flags-archived",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dead-seeded-flags-archived.mjs"]);
  },
};
