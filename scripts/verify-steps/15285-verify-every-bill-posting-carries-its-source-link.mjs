export default {
  name: "verify:every-bill-posting-carries-its-source-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-every-bill-posting-carries-its-source-link.mjs"]);
  },
};
