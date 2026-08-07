// GUARD — Maintenance Settings box-in-box flatten (verify-step 2322 · Cursor EVEN band).
export default {
  name: "mnt-settings-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-mnt-settings-no-box-in-box.mjs"]);
  },
};
