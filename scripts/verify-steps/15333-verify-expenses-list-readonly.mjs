export default {
  name: "verify:expenses-list-readonly",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expenses-list-readonly.mjs"]);
  },
};
