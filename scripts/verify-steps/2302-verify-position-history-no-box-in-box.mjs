// GUARD — Position History box-in-box flatten (verify-step 2302 · Cursor EVEN band).
export default {
  name: "position-history-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-position-history-no-box-in-box.mjs"]);
  },
};
