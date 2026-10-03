export default {
  name: "verify:every-posting-has-its-spine-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-every-posting-has-its-spine-link.mjs"]);
  },
};
