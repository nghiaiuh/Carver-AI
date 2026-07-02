/*
 * Flow: Provides a typed module for the Carver AI app.
 * 1. Define local data, helpers, or UI.
 * 2. Export the public function/component/types.
 * 3. Support the surrounding feature with focused logic.
 */

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
