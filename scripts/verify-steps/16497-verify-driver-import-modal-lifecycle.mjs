export default {
  name: "verify:driver-import-modal-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-import-modal-lifecycle.mjs"]);
  },
};
