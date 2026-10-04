export default {
  name: "verify:drivers-fk-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-fk-wired.mjs"]);
  },
};
