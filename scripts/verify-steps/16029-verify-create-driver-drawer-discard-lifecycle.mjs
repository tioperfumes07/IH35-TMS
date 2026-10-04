export default {
  name: "verify:create-driver-drawer-discard-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-create-driver-drawer-discard-lifecycle.mjs"]);
  },
};
