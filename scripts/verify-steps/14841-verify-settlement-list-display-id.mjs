export default {
  name: "verify:settlement-list-display-id",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-list-display-id.mjs"]);
  },
};
