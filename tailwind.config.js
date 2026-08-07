/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--bh-bg)",
        primary: "#f59e0b",
        accent: "#facc15",
        "bh-bg": "var(--bh-bg)",
        "bh-grad-from": "var(--bh-grad-from)",
        "bh-grad-via": "var(--bh-grad-via)",
        "bh-grad-to": "var(--bh-grad-to)",
        "bh-surface": "var(--bh-surface)",
        "bh-card": "var(--bh-card)",
        "bh-elevated": "var(--bh-elevated)",
        "bh-input": "var(--bh-input)",
        "bh-text": "var(--bh-text)",
        "bh-muted": "var(--bh-muted)",
        "bh-faint": "var(--bh-faint)",
        "bh-border": "var(--bh-border)",
        "bh-border-strong": "var(--bh-border-strong)",
        "bh-overlay": "var(--bh-overlay)",
        "bh-overlay-soft": "var(--bh-overlay-soft)",
      },
      fontFamily: {
        sans: ["system-ui", "ui-sans-serif", "sans-serif"]
      }
    }
  },
  plugins: []
};
