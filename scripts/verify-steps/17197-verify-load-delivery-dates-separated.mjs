export default {
  name: "verify:load-delivery-dates-separated",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-delivery-dates-separated.mjs"]);
  },
};
