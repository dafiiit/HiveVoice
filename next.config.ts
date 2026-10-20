import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  devIndicators: false,
  // A second build folder (NEXT_DIST_DIR=.next-prod) lets a production build run next to a dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Standalone output lets the app run in a plain Docker container for self-hosting.
  output: "standalone",
  // Addresses that moved; old links (and query parameters such as the secret link key ?k=) keep working.
  redirects: async () => {
    const q = (key: string, value?: string) => [{ type: "query" as const, key, ...(value ? { value } : {}) }];
    return [
      // Since 2026-10-20 three areas (Gemeinschaft, Freunde, Ich) with English addresses.
      { source: "/anliegen/:id", destination: "/listings/:id", permanent: true },
      { source: "/offers/:id", destination: "/listings/:id", permanent: true },
      { source: "/needs/:id", destination: "/listings/:id", permanent: true },
      { source: "/anliegen", has: q("as"), destination: "/me/listings", permanent: true },
      { source: "/anliegen", has: q("tab", "you"), destination: "/me/listings", permanent: true },
      { source: "/anliegen", destination: "/community/listings", permanent: true },
      { source: "/offers", destination: "/me/listings?as=offer", permanent: true },
      { source: "/needs", destination: "/me/listings?as=need", permanent: true },
      { source: "/explore", has: q("kind", "people"), destination: "/community/people", permanent: true },
      { source: "/explore", has: q("kind", "groups"), destination: "/community/groups", permanent: true },
      { source: "/explore", has: q("kind", "market"), destination: "/community/listings", permanent: true },
      { source: "/explore", has: q("kind", "responsible"), destination: "/community/people?q=zuständig", permanent: true },
      { source: "/explore", has: q("kind", "links"), destination: "/community/groups", permanent: true },
      { source: "/explore", destination: "/community/groups?kind=initiatives", permanent: true },
      { source: "/connect", has: q("c", "market"), destination: "/community", permanent: true },
      { source: "/connect", destination: "/friends", permanent: true },
      { source: "/groups", destination: "/friends?f=groups", permanent: true },
      { source: "/inhalte/listen/:id", destination: "/me/lists/:id", permanent: true },
      { source: "/inhalte", destination: "/me", permanent: true },
      // /me used to be the settings ("Für mich"); its tabs moved to /settings.
      { source: "/me", has: q("tab"), destination: "/settings", permanent: true },
      { source: "/einladung/:code", destination: "/invite/:code", permanent: true },
      { source: "/join/:code", destination: "/invite/:code", permanent: true },
      { source: "/teilen", destination: "/sharing", permanent: true },
      { source: "/rechte", destination: "/rights", permanent: true },
      { source: "/transparenz", destination: "/transparency", permanent: true },
      { source: "/verwaltung", destination: "/admin", permanent: true },
      { source: "/new/group", has: q("purpose", "demand"), destination: "/new/initiative", permanent: true },
    ];
  },

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
