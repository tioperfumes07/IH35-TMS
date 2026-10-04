export default {
  name: "verify:cancelled-load-leaves-no-live-money",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cancelled-load-leaves-no-live-money.mjs"]);
  },
};
