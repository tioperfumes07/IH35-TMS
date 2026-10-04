export default {
  name: "verify:truck-lease",
  run(ctx) {
    ctx.run("node", ["scripts/verify-truck-lease.mjs"]);
  },
};
