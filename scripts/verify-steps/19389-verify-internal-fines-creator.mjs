export default {
  name: "verify:internal-fines-creator",
  run(ctx) {
    ctx.run("node", ["scripts/verify-internal-fines-creator.mjs"]);
  },
};
