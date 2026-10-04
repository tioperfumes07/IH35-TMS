export default {
  name: "verify:banking-designview-qbo-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-designview-qbo-parity.mjs"]);
  },
};
