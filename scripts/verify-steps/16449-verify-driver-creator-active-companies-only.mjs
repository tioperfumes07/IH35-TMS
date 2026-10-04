export default {
  name: "verify:driver-creator-active-companies-only",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-creator-active-companies-only.mjs"]);
  },
};
