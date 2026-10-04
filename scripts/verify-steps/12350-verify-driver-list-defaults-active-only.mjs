export default {
  name: "verify:driver-list-defaults-active-only",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-list-defaults-active-only.mjs"]);
  },
};
