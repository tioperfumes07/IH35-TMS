export default {
  name: "verify:aggregate-schema-grants",
  run(ctx) {
    ctx.run("node", ["scripts/verify-aggregate-schema-grants.mjs"]);
  },
};
