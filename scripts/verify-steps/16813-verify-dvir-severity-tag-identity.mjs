export default {
  name: "verify:dvir-severity-tag-identity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dvir-severity-tag-identity.mjs"]);
  },
};
