export default {
  name: "verify:no-deprecated-schema-creates",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-deprecated-schema-creates.mjs"]);
  },
};
