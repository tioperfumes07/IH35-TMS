export default {
  name: "verify:fh2-no-posting",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fh2-no-posting.mjs"]);
  },
};
