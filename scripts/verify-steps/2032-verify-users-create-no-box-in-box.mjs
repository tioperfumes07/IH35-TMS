// Users Create User drawer — Password setup radios must stay flat (verify-step 2032, Cursor EVEN band).
export default {
  name: "users-create-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-users-create-no-box-in-box.mjs"]);
  },
};
