/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "pwa-bg": "#0F1219",
        "pwa-card": "#1A1F2C",
        "pwa-text-primary": "#F1F5F9",
        "pwa-text-secondary": "#94A3B8",
        "pwa-border": "#2A3142",
        hos: {
          driving: "#10B981",
          sleeper: "#6B7280",
          onduty_waiting: "#F59E0B",
          offduty_reset: "#3B82F6",
          violation: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};

