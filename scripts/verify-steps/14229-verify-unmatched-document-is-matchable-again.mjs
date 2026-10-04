export default {
  name: "verify:unmatched-document-is-matchable-again",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unmatched-document-is-matchable-again.mjs"]);
  },
};
