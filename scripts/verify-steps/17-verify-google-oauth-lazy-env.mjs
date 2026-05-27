export default {
  name: "verify-google-oauth-lazy-env",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:google-oauth-lazy-env"]) !== 0) {
      process.exit(1);
    }
  },
};
