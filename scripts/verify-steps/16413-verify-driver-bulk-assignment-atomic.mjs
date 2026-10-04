export default {
  name: "verify:driver-bulk-assignment-atomic",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-bulk-assignment-atomic.mjs"]);
  },
};
