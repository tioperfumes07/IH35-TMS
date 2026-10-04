export default {
  name: "verify:only-the-posting-engine-writes-postings",
  run(ctx) {
    ctx.run("node", ["scripts/verify-only-the-posting-engine-writes-postings.mjs"]);
  },
};
