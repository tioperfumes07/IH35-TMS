export default {
  name: "verify:relay-deposit-classifier-no-post",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-deposit-classifier-no-post.mjs"]);
  },
};
