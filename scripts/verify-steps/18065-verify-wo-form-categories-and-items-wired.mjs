export default {
  name: "verify:wo-form-categories-and-items-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-form-categories-and-items-wired.mjs"]);
  },
};
