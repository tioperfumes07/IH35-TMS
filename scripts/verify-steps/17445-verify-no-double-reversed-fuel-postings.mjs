export default {
  name: "verify:no-double-reversed-fuel-postings",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-double-reversed-fuel-postings.mjs"]);
  },
};
