export default {
  name: "verify:fence-capture-feeds-stops-never-interpolates",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fence-capture-feeds-stops-never-interpolates.mjs"]);
  },
};
