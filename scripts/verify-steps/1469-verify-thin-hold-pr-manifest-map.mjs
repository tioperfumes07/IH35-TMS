export default {
  name: "verify:thin-hold-pr-manifest-map",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-thin-hold-pr-manifest-map.mjs"]);
  },
};
