export default {
  name: "verify:one-leg-asset-never-credit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-one-leg-asset-never-credit.mjs"]);
  },
};
