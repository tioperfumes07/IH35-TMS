export default {
  name: "verify:driver-list-excludes-deactivated",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-list-excludes-deactivated.mjs"]);
  },
};
