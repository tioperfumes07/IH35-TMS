export default {
  name: "verify:no-spurious-duplicates",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-spurious-duplicates.mjs"]);
  },
};
