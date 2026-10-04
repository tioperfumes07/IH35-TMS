export default {
  name: "verify:fh3-no-posting",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fh3-no-posting.mjs"]);
  },
};
