export default {
  name: "verify:fh4-no-posting",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fh4-no-posting.mjs"]);
  },
};
