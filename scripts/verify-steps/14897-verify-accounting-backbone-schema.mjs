export default {
  name: "verify:accounting-backbone-schema",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-backbone-schema.mjs"]);
  },
};
