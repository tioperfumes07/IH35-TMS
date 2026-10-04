export default {
  name: "verify:border-crossing-cbp-wait-cache-rls",
  run(ctx) {
    ctx.run("node", ["scripts/verify-border-crossing-cbp-wait-cache-rls.mjs"]);
  },
};
