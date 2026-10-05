import { describe, expect, it, vi } from "vitest";
import {
  desktopReleaseFiles,
  discoverPublishedDesktopRelease,
  latestReleaseApi,
  publishedDesktopRelease,
  readPublishedDesktopRelease,
} from "../src/lib/desktop-release.mjs";
import { archiveName } from "../../../scripts/desktop-release.mjs";
import { publicRelease } from "./fixtures/desktop-release.ts";

describe("published desktop download discovery", () => {
  it("uses the release pipeline's exact filenames for all three native targets", () => {
    expect(desktopReleaseFiles("v0.1.1").assets).toHaveLength(5);
    const release = publishedDesktopRelease(publicRelease());
    expect(release.version).toBe("0.1.1");
    expect(release.downloads).toHaveLength(3);
    for (const download of release.downloads) {
      expect(download.filename).toBe(archiveName(release.version, download.target));
      expect(download.url).toBe(`https://github.com/antennabench/antennabench/releases/download/v0.1.1/${download.filename}`);
    }
    expect(release.checksumsUrl).toMatch(/\/AntennaBench-0\.1\.1-SHA256SUMS$/);
    expect(release.manifestUrl).toMatch(/\/AntennaBench-0\.1\.1-release-manifest\.json$/);
    expect(readPublishedDesktopRelease(JSON.stringify(publicRelease()))).toEqual(release);
    for (const download of release.downloads.filter(({ target }: { target: string }) => target.endsWith("-apple-darwin"))) {
      expect(download.format).toBe("macOS app · .zip");
      expect(download.format).not.toMatch(/signed|notarized/i);
    }
  });

  it.each([
    ["draft", { draft: true }],
    ["prerelease", { prerelease: true }],
    ["mutable", { immutable: false }],
    ["unpublished", { published_at: null }],
    ["invalid publication date", { published_at: "pending" }],
    ["preview tag", { tag_name: "v0.1.0-beta.1" }],
    ["foreign repository", { html_url: "https://github.com/example/other/releases/tag/v0.1.0" }],
  ])("rejects a %s release", (_name, overrides) => {
    expect(() => publishedDesktopRelease({ ...publicRelease(), ...overrides })).toThrow();
  });

  it("rejects missing, extra, and duplicate assets instead of enabling partial downloads", () => {
    for (const change of [
      (assets: ReturnType<typeof publicRelease>["assets"]) => assets.slice(1),
      (assets: ReturnType<typeof publicRelease>["assets"]) => [...assets, { ...assets[0]!, name: "NON_PUBLISHABLE.txt" }],
      (assets: ReturnType<typeof publicRelease>["assets"]) => [assets[0]!, ...assets.slice(0, -1)],
    ]) {
      const release = publicRelease();
      release.assets = change(release.assets);
      expect(() => publishedDesktopRelease(release)).toThrow("exact five");
    }
  });

  it.each([
    { state: "new" },
    { size: 0 },
    { size: 1.5 },
    { browser_download_url: "https://example.com/setup.exe" },
    { browser_download_url: "https://github.com/antennabench/antennabench/releases/download/v0.0.1/setup.exe" },
  ])("rejects incomplete or redirected asset metadata: %j", (overrides) => {
    const release = publicRelease();
    Object.assign(release.assets[0]!, overrides);
    expect(() => publishedDesktopRelease(release)).toThrow("incomplete or has an unexpected URL");
  });

  it("returns a pending state only when GitHub has no public stable release", async () => {
    const fetchRelease = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(discoverPublishedDesktopRelease({ fetchRelease })).resolves.toBeNull();
    expect(fetchRelease).toHaveBeenCalledWith(latestReleaseApi, expect.objectContaining({
      headers: expect.objectContaining({ Accept: "application/vnd.github+json" }),
      signal: expect.any(AbortSignal),
    }));
  });

  it("fails a deployment on API errors rather than falsely withdrawing downloads", async () => {
    const fetchRelease = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(discoverPublishedDesktopRelease({ fetchRelease })).rejects.toThrow("HTTP 403");
  });

  it("discovers complete public metadata without credentials", async () => {
    const metadata = publicRelease();
    const fetchRelease = vi.fn().mockResolvedValue(Response.json(metadata));
    await expect(discoverPublishedDesktopRelease({ fetchRelease })).resolves.toEqual(metadata);
    const headers = fetchRelease.mock.calls[0]![1].headers;
    expect(headers).not.toHaveProperty("Authorization");
  });
});
