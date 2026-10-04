export default {
  name: "verify:responsive-layout",
  run(ctx) {
    ctx.run("node", ["scripts/verify-responsive-layout.mjs"]);
  },
};
