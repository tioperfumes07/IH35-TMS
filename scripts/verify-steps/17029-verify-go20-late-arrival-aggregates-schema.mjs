export default {
  name: "verify:go20-late-arrival-aggregates-schema",
  run(ctx) {
    ctx.run("node", ["scripts/verify-go20-late-arrival-aggregates-schema.mjs"]);
  },
};
