export default {
  name: "verify:quality-standard-present",
  run(ctx) {
    ctx.run("node", ["scripts/verify-quality-standard-present.mjs"]);
  },
};
