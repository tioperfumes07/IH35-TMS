export default {
  name: "verify:driven-miles-legs-never-interpolate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driven-miles-legs-never-interpolate.mjs"]);
  },
};
