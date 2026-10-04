export default {
  name: "verify:go19-bill-driver-recovery-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-go19-bill-driver-recovery-parity.mjs"]);
  },
};
