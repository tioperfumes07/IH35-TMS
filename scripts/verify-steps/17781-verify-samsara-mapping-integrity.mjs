export default {
  name: "verify:samsara-mapping-integrity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-mapping-integrity.mjs"]);
  },
};
