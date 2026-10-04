import { spawn, spawnSync } from "node:child_process";
import { constants } from "node:os";
import { fileURLToPath } from "node:url";

import { nativeWindowsEnvironment } from "./desktop-windows-release.mjs";

function terminate(child, env) {
  if (child.pid && process.platform === "win32") {
    const result = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      env, stdio: "ignore", windowsHide: true, timeout: 30_000,
    });
    if (!result.error && result.status === 0) return;
  } else if (child.pid) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // The process group may have exited as the timeout fired.
    }
  }
  child.kill("SIGKILL");
}

export async function runCargoDeny(args, {
  env = process.env,
  cwd = process.cwd(),
  timeoutMs = 600_000,
  spawnCommand = spawn,
  normalizeEnvironment = nativeWindowsEnvironment,
} = {}) {
  // Nested mise tasks reactivate MSYS paths. Normalize immediately before the
  // native command so Cargo-Deny's Cargo fetch/metadata children inherit them.
  const nativeEnv = normalizeEnvironment(env);
  return new Promise((resolve, reject) => {
    const child = spawnCommand("cargo-deny", args, {
      cwd, env: nativeEnv, stdio: "inherit", windowsHide: true,
      detached: process.platform !== "win32",
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      terminate(child, nativeEnv);
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`cargo-deny could not start: ${error.message}`, { cause: error }));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`cargo-deny exceeded ${timeoutMs / 1000}s and was terminated`));
      else if (signal) resolve(128 + (constants.signals[signal] ?? 1));
      else if (typeof code === "number") resolve(code);
      else reject(new Error("cargo-deny exited without a status or signal"));
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await runCargoDeny(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
