import { defineConfig } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  base: "./",
  // resolve: {
  //   alias: {
  //     "@runtimed/components/styles.css": resolve(
  //       __dirname,
  //       "../components/dist/styles.css"
  //     ),
  //   },
  // },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        react: resolve(__dirname, "react.html"),
        demo: resolve(__dirname, "demo.html"),
      },
    },
  },
});
