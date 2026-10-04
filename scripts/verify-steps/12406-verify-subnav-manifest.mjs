export default {
  name: "verify:subnav-manifest",
  run(ctx) {
    ctx.run("node", ["scripts/verify-subnav-manifest.mjs"]);
  },
};
