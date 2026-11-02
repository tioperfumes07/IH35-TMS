export default {
  name: "verify:no-overflow-clipped-hover-dropdown",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-overflow-clipped-hover-dropdown.mjs"]);
  },
};
