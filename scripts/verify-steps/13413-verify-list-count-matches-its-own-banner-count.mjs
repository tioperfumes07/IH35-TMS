export default {
  name: "verify:list-count-matches-its-own-banner-count",
  run(ctx) {
    ctx.run("node", ["scripts/verify-list-count-matches-its-own-banner-count.mjs"]);
  },
};
