import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  devIndicators: false,
  // A second build folder (NEXT_DIST_DIR=.next-prod) lets a production build run next to a dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Standalone output lets the app run in a plain Docker container for self-hosting.
  output: "standalone",
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
