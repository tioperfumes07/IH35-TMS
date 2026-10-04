export default {
  name: "verify:border-crossing-customs-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-border-crossing-customs-link.mjs"]);
  },
};
