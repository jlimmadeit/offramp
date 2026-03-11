/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F5F5F7",
        sidebar: {
          border: "#E5E5EA",
        },
        node: {
          videos: "#AF52DE",
          audio: "#5AC8FA",
          textHooks: "#FF9500",
          editStyle: "#5856D6",
          aesthetic: "#007AFF",
          account: "#FF3B30",
          complete: "#34C759",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "SF Pro Display",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        node: "0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)",
        "node-hover":
          "0 2px 8px rgba(0,0,0,0.10), 0 8px 24px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
};
