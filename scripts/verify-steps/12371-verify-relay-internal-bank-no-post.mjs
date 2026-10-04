export default {
  name: "verify:relay-internal-bank-no-post",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-internal-bank-no-post.mjs"]);
  },
};
