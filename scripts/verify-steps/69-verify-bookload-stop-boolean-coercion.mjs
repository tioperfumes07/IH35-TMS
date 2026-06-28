export default {
  name: "verify-bookload-stop-boolean-coercion",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:bookload-stop-boolean-coercion"]) !== 0) {
      process.exit(1);
    }
  },
};
