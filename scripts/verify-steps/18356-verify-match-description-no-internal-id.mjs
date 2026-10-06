export default {
  name: "verify:match-description-no-internal-id",
  run(ctx) {
    ctx.run("node", ["scripts/verify-match-description-no-internal-id.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-match-description-no-internal-id.mjs"]);
  },
};
