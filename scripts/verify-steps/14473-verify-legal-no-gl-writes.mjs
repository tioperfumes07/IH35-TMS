export default {
  name: "verify:legal-no-gl-writes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-legal-no-gl-writes.mjs"]);
  },
};
