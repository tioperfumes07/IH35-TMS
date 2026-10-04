export default {
  name: "verify:customers-vendors-gaps",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customers-vendors-gaps.mjs"]);
  },
};
