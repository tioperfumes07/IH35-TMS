export default {
  name: "verify:awaiting-truck-driver-hos",
  run(ctx) {
    ctx.run("node", ["scripts/verify-awaiting-truck-driver-hos.mjs"]);
  },
};
