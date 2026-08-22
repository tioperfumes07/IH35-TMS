export default {
  name: "verify:je-list-memo-resolves-source-name",
  run(ctx) {
    ctx.run("node", ["scripts/verify-je-list-memo-resolves-source-name.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-je-list-memo-resolves-source-name.mjs"]);
  },
};
