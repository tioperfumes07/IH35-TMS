/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        crit: "#DC2626",
        warn: "#D97706",
        info: "#2563EB",
        ok: "#059669",
        inactive: "#6B7280",
        sidebar: {
          bg: "#1F2937",
          active: "#374151",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};

