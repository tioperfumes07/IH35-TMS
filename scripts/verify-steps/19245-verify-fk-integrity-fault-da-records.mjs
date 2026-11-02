export default {
  name: "verify:fk-integrity-fault-da-records",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fk-integrity-fault-da-records.mjs"]);
  },
};
