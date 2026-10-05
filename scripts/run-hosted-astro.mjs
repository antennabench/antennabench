import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  discoverPublishedDesktopRelease,
  releaseEnvironmentKey,
} from "../apps/hosted/src/lib/desktop-release.mjs";

const command = process.argv[2];
const discoverDownloads = process.argv[3] === "--published-downloads";
if (command !== "build" || process.argv.length > (discoverDownloads ? 4 : 3)) {
  throw new Error("usage: run-hosted-astro.mjs build [--published-downloads]");
}

const buildEnvironment = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" };
delete buildEnvironment[releaseEnvironmentKey];
if (discoverDownloads) {
  const release = await discoverPublishedDesktopRelease();
  if (release !== null) buildEnvironment[releaseEnvironmentKey] = JSON.stringify(release);
  console.log(release === null ? "Desktop downloads: no public stable release" : `Desktop downloads: ${release.tag_name}, five published assets`);
}

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const hostedRoot = join(repositoryRoot, "apps", "hosted");
const astroCli = join(repositoryRoot, "node_modules", "astro", "bin", "astro.mjs");
const result = spawnSync(process.execPath, [astroCli, command], {
  cwd: hostedRoot,
  encoding: "utf8",
  env: buildEnvironment,
});

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
