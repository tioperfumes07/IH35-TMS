// Users Admin Tools — owner strip must stay flat (verify-step 2024, Cursor EVEN band).
export default {
  name: "users-admin-tools-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-users-admin-tools-no-box-in-box.mjs"]);
  },
};
