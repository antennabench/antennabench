import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { publishedDesktopRelease, releaseEnvironmentKey } from "../src/lib/desktop-release.mjs";
import { publicRelease } from "./fixtures/desktop-release.ts";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const hostedRoot = join(repositoryRoot, "apps", "hosted");
const astroCli = join(repositoryRoot, "node_modules", "astro", "bin", "astro.mjs");

describe("static desktop download pages", () => {
  it.each([false, true])("renders accurate availability with published release=%s", (published) => {
    const output = mkdtempSync(join(tmpdir(), "antennabench-download-test-"));
    try {
      const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" };
      delete env[releaseEnvironmentKey];
      if (published) env[releaseEnvironmentKey] = JSON.stringify(publicRelease());
      const build = spawnSync(process.execPath, [astroCli, "build", "--outDir", output], {
        cwd: hostedRoot,
        env,
        encoding: "utf8",
        timeout: 20_000,
      });
      expect(build.error, build.stderr).toBeUndefined();
      expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);
      const download = readFileSync(join(output, "download", "index.html"), "utf8");
      const home = readFileSync(join(output, "index.html"), "utf8");
      expect(download).not.toMatch(/<script\b/i);
      expect(download).toContain("intentionally unsigned");
      expect(download).toContain("Developer ID");
      expect(download).toContain("not Developer ID signed or notarized");
      expect(download).toContain("Open Anyway");
      expect(download).toContain("Do not override a malware or damaged-app alert.");
      expect(download).not.toContain("Signed and notarized app");
      expect(download).not.toContain("Published Mac apps are signed");
      expect(download).not.toMatch(/xattr|spctl --master-disable/);
      if (published) {
        const release = publishedDesktopRelease(publicRelease());
        expect(download).toContain('data-desktop-release="v0.1.1"');
        for (const url of [...release.downloads.map(({ url }: { url: string }) => url), release.checksumsUrl, release.manifestUrl]) {
          expect(download).toContain(`href="${url}"`);
        }
        expect(download).not.toContain("Desktop downloads are not available yet.");
        expect(home).toContain(">Download AntennaBench</a>");
        expect(home).toContain("Version 0.1.1 is available");
      } else {
        expect(download).toContain('data-desktop-release="unavailable"');
        expect(download).toContain("Desktop downloads are not available yet.");
        expect(download).not.toContain("/releases/download/");
        expect(home).not.toContain(">Download AntennaBench</a>");
      }
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  }, 30_000);
});
