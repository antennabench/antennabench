import { desktopReleaseFiles } from "../../src/lib/desktop-release.mjs";

export function publicRelease() {
  const files = desktopReleaseFiles("v0.1.0");
  return {
    tag_name: files.tag,
    html_url: files.url,
    draft: false,
    prerelease: false,
    immutable: true,
    published_at: "2026-10-05T12:00:00Z",
    assets: files.assets.map((name: string) => ({
      name,
      size: 1024,
      state: "uploaded",
      browser_download_url: `https://github.com/antennabench/antennabench/releases/download/${files.tag}/${name}`,
    })),
  };
}
