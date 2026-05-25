import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative assets make the built app work from GitHub Pages project URLs,
  // for example https://username.github.io/repo-name/.
  base: "./",
  plugins: [react()],
});
