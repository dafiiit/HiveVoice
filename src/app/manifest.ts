import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HiveVoice",
    short_name: "HiveVoice",
    description: "Anfragen, anbieten, verbinden. Von der Idee zur Veränderung.",
    start_url: "/friends",
    display: "standalone",
    background_color: "#f4f4f4",
    // The colour Android gives its own bars around the installed app (the navigation bar at the bottom too): the white of
    // the app's bottom bar, not black. The status bar follows the page's theme-color (src/app/layout.tsx), also in dark.
    theme_color: "#ffffff",
    lang: "de",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
