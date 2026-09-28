export default {
  name: "verify:close-recalculates-bills-from-real-mileage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-close-recalculates-bills-from-real-mileage.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-close-recalculates-bills-from-real-mileage.mjs"]);
  },
};
