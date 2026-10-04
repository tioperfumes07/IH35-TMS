export default {
  name: "verify:random-pool-driver-reverse-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-random-pool-driver-reverse-lifecycle.mjs"]);
  },
};
