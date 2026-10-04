export default {
  name: "verify:cu09-forensic-settlement",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cu09-forensic-settlement.mjs"]);
  },
};
