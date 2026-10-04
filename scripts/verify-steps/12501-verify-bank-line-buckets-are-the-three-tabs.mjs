export default {
  name: "verify:bank-line-buckets-are-the-three-tabs",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-line-buckets-are-the-three-tabs.mjs"]);
  },
};
