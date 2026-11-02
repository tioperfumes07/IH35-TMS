export default {
  name: "verify:no-stranded-intermediate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-stranded-intermediate.mjs"]);
  },
};
