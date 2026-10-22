import "server-only";

// The newest desktop build (Tauri, .github/workflows/desktop.yml) from GitHub releases, so the start page
// can link each file directly with its size, like a download page. Checked at most once an hour.
export type DesktopFile = { system: "windows" | "mac" | "linux"; kind: string; url: string; size: number };
export type DesktopRelease = { version: string; files: DesktopFile[] };

const kinds: [RegExp, DesktopFile["system"], string][] = [
  [/-setup\.exe$/, "windows", ".exe"],
  [/\.msi$/, "windows", ".msi"],
  [/\.dmg$/, "mac", ".dmg"],
  [/\.AppImage$/, "linux", ".AppImage"],
  [/\.deb$/, "linux", ".deb"],
];

export async function desktopRelease(): Promise<DesktopRelease | null> {
  try {
    const res = await fetch("https://api.github.com/repos/dafiiit/HiveVoice/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name: string; assets: { name: string; browser_download_url: string; size: number }[] };
    const files = kinds.flatMap(([re, system, kind]) => {
      const a = data.assets.find((x) => re.test(x.name));
      return a ? [{ system, kind, url: a.browser_download_url, size: a.size }] : [];
    });
    return files.length ? { version: data.tag_name.replace(/^v/, ""), files } : null;
  } catch {
    return null;
  }
}
