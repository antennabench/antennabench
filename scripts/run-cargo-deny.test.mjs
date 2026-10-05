import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { constants } from "node:os";
import test from "node:test";

import { runCargoDeny } from "./run-cargo-deny.mjs";

test("Cargo-Deny receives unchanged locked policy selectors and the normalized child environment", async () => {
  const inherited = { PATH: "/c/tools:/usr/bin", CARGO: "/c/tools/cargo.exe", KEEP: "value" };
  const normalized = { PATH: "C:\\tools;C:\\Git\\usr\\bin", CARGO: "C:\\tools\\cargo.exe", KEEP: "value" };
  for (const selectors of [["bans", "licenses", "sources"], ["advisories"]]) {
    const args = ["--locked", "check", ...selectors];
    const code = await runCargoDeny(args, {
      env: inherited,
      cwd: "/repository with spaces",
      normalizeEnvironment(env) {
        assert.equal(env, inherited);
        return normalized;
      },
      spawnCommand(command, forwarded, options) {
        assert.equal(command, "cargo-deny");
        assert.equal(forwarded, args);
        assert.equal(options.env, normalized);
        assert.equal(options.cwd, "/repository with spaces");
        assert.equal(options.stdio, "inherit");
        const child = new EventEmitter();
        queueMicrotask(() => child.emit("close", 0, null));
        return child;
      },
    });
    assert.equal(code, 0);
  }
});

test("Cargo-Deny policy failures and termination signals preserve nonzero exit status", async () => {
  for (const [code, signal, expected] of [[7, null, 7], [null, "SIGTERM", 128 + constants.signals.SIGTERM]]) {
    assert.equal(await runCargoDeny(["--locked", "check", "advisories"], {
      normalizeEnvironment: (env) => env,
      spawnCommand() {
        const child = new EventEmitter();
        queueMicrotask(() => child.emit("close", code, signal));
        return child;
      },
    }), expected);
  }
});

test("Cargo-Deny startup and timeout failures fail closed", async () => {
  await assert.rejects(runCargoDeny([], {
    normalizeEnvironment: (env) => env,
    spawnCommand() {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("error", new Error("program not found")));
      return child;
    },
  }), /could not start: program not found/);
  let terminated = false;
  await assert.rejects(runCargoDeny([], {
    timeoutMs: 1,
    normalizeEnvironment: (env) => env,
    spawnCommand() {
      const child = new EventEmitter();
      child.kill = (signal) => {
        terminated = true;
        assert.equal(signal, "SIGKILL");
        child.emit("close", null, signal);
      };
      return child;
    },
  }), /exceeded .* and was terminated/);
  assert.equal(terminated, true);
});
