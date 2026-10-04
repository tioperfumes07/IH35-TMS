export default {
  name: "verify:cu09-account-drawer-wire",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cu09-account-drawer-wire.mjs"]);
  },
};
