export default {
  name: "verify:unit-stop-events-no-clipped-starts",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-stop-events-no-clipped-starts.mjs"]);
  },
};
