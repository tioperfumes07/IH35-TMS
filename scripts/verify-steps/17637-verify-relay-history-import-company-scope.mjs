export default {
  name: "verify:relay-history-import-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-history-import-company-scope.mjs"]);
  },
};
