export default {
  name: "verify:suggestion-is-action",
  run(ctx) {
    ctx.run("node", ["scripts/verify-suggestion-is-action.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-suggestion-is-action.mjs"]);
  },
};
