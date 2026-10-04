export default {
  name: "verify:live-db-schema-script-wiring",
  run(ctx) {
    ctx.run("node", ["scripts/verify-live-db-schema-script-wiring.mjs"]);
  },
};
