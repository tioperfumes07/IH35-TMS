export default {
  name: "verify:every-posting-has-a-spine-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-every-posting-has-a-spine-link.mjs"]);
  },
};
