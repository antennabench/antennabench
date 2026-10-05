const repository = "https://github.com/antennabench/antennabench";
export const latestReleaseApi = "https://api.github.com/repos/antennabench/antennabench/releases/latest";
export const releaseEnvironmentKey = "ANTENNABENCH_PUBLISHED_DESKTOP_RELEASE";

export function desktopReleaseFiles(tag) {
  if (typeof tag !== "string" || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
    throw new Error("Website downloads require a stable vMAJOR.MINOR.PATCH release tag");
  }
  const version = tag.slice(1);
  const prefix = `AntennaBench-${version}`;
  const base = `${repository}/releases/download/${tag}`;
  const downloads = [
    {
      target: "x86_64-pc-windows-msvc",
      title: "Windows",
      requirements: "Windows 11 · 64-bit Intel or AMD",
      format: "Per-user installer · .exe",
      filename: `${prefix}-x86_64-pc-windows-msvc-setup.exe`,
    },
    {
      target: "aarch64-apple-darwin",
      title: "Mac · Apple silicon",
      requirements: "macOS 15 or later · M1 or newer",
      format: "Signed and notarized app · .zip",
      filename: `${prefix}-aarch64-apple-darwin.zip`,
    },
    {
      target: "x86_64-apple-darwin",
      title: "Mac · Intel",
      requirements: "macOS 15 or later · Intel processor",
      format: "Signed and notarized app · .zip",
      filename: `${prefix}-x86_64-apple-darwin.zip`,
    },
  ].map((download) => ({ ...download, url: `${base}/${download.filename}` }));
  const checksums = `${prefix}-SHA256SUMS`;
  const manifest = `${prefix}-release-manifest.json`;
  return {
    tag,
    version,
    url: `${repository}/releases/tag/${tag}`,
    downloads,
    checksumsUrl: `${base}/${checksums}`,
    manifestUrl: `${base}/${manifest}`,
    assets: [...downloads.map(({ filename }) => filename), checksums, manifest],
  };
}

export function publishedDesktopRelease(metadata) {
  if (
    metadata?.draft !== false || metadata?.prerelease !== false ||
    metadata?.immutable !== true ||
    typeof metadata?.published_at !== "string" || !Number.isFinite(Date.parse(metadata.published_at))
  ) {
    throw new Error("Website downloads require a published immutable stable release");
  }
  const release = desktopReleaseFiles(metadata.tag_name);
  if (metadata.html_url !== release.url || !Array.isArray(metadata.assets)) {
    throw new Error("Website release metadata does not match the AntennaBench repository");
  }
  const names = metadata.assets.map(({ name }) => name).sort();
  if (JSON.stringify(names) !== JSON.stringify([...release.assets].sort())) {
    throw new Error("Website downloads require the exact five desktop release assets");
  }
  for (const asset of metadata.assets) {
    const expectedUrl = `${repository}/releases/download/${release.tag}/${asset.name}`;
    if (asset.state !== "uploaded" || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.browser_download_url !== expectedUrl) {
      throw new Error(`Website release asset is incomplete or has an unexpected URL: ${asset.name}`);
    }
  }
  return release;
}

export function readPublishedDesktopRelease(serialized = process.env[releaseEnvironmentKey]) {
  return serialized === undefined ? null : publishedDesktopRelease(JSON.parse(serialized));
}

export async function discoverPublishedDesktopRelease({ fetchRelease = fetch } = {}) {
  const response = await fetchRelease(latestReleaseApi, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "AntennaBench-site-build",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Public desktop release discovery failed: HTTP ${response.status}`);
  const metadata = await response.json();
  publishedDesktopRelease(metadata);
  return metadata;
}
