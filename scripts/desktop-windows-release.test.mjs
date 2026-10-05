import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { nativeWindowsEnvironment, readPeHeader, validateWindowsTauriContract, windowsPowerShellPath } from "./desktop-windows-release.mjs";

function fixture(t, bytes) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "antennabench-pe-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "application.exe");
  fs.writeFileSync(filename, bytes);
  return filename;
}

function executableHeader(architecture) {
  const bytes = Buffer.alloc(512);
  const offset = 128;
  bytes.write("MZ", 0);
  bytes.writeUInt32LE(offset, 0x3c);
  bytes.set([0x50, 0x45, 0, 0], offset);
  bytes.writeUInt16LE(architecture === "x86_64" ? 0x8664 : 0x14c, offset + 4);
  bytes.writeUInt16LE(architecture === "x86_64" ? 240 : 224, offset + 20);
  bytes.writeUInt16LE(architecture === "x86_64" ? 0x20b : 0x10b, offset + 24);
  bytes.writeUInt32LE(16, offset + 24 + (architecture === "x86_64" ? 108 : 92));
  return bytes;
}

test("reads the x64 application and x86 NSIS launcher as distinct architectures", (t) => {
  for (const [architecture, machine] of [["x86_64", "0x8664"], ["x86", "0x014c"]]) {
    assert.deepEqual(readPeHeader(fixture(t, executableHeader(architecture))), {
      architecture, machine, has_authenticode_certificate: false,
    });
  }
});

test("detects a certificate-table entry even when only offset or size is nonzero", (t) => {
  for (const architecture of ["x86_64", "x86"]) {
    for (const entryOffset of [0, 4]) {
      const bytes = executableHeader(architecture);
      const securityDirectory = 128 + 24 + (architecture === "x86_64" ? 112 : 96) + 32;
      bytes.writeUInt32LE(400, securityDirectory + entryOffset);
      assert.equal(readPeHeader(fixture(t, bytes)).has_authenticode_certificate, true);
    }
  }
});

test("rejects malformed executable headers instead of inferring architecture", (t) => {
  const mutations = [
    [(bytes) => bytes.fill(0, 0, 2), /DOS executable header/],
    [(bytes) => bytes.writeUInt32LE(12, 0x3c), /invalid PE header offset/],
    [(bytes) => bytes.writeUInt32LE(510, 0x3c), /truncated PE header/],
    [(bytes) => bytes.fill(0, 128, 132), /PE executable signature/],
    [(bytes) => bytes.writeUInt16LE(0xaa64, 132), /unsupported PE machine/],
    [(bytes) => bytes.writeUInt16LE(0x10b, 152), /unsupported PE machine/],
    [(bytes) => bytes.writeUInt16LE(80, 148), /optional header length/],
    [(bytes) => bytes.writeUInt32LE(4, 260), /certificate table/],
  ];
  for (const [mutate, expected] of mutations) {
    const bytes = executableHeader("x86_64");
    mutate(bytes);
    assert.throws(() => readPeHeader(fixture(t, bytes)), expected);
  }
  assert.throws(() => readPeHeader(fixture(t, Buffer.alloc(5))), /truncated PE header/);
});

test("checked-in Windows bundling uses the supported unsigned offline installer contract", () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const config = validateWindowsTauriContract(root);
  assert.equal(config.bundle.windows.nsis.installMode, "currentUser");
  assert.equal(config.bundle.windows.webviewInstallMode.type, "offlineInstaller");
});

test("release configuration rejects paid signing or a changed installer contract", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "antennabench-windows-config-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "apps", "desktop");
  fs.mkdirSync(directory, { recursive: true });
  const reference = validateWindowsTauriContract(fileURLToPath(new URL("../", import.meta.url)));
  const mutations = [
    (config) => { config.bundle.publisher = "another publisher"; },
    (config) => { config.bundle.targets = ["msi"]; },
    (config) => { config.bundle.windows.nsis.installMode = "perMachine"; },
    (config) => { config.bundle.windows.webviewInstallMode.type = "downloadBootstrapper"; },
    (config) => { config.bundle.windows.allowDowngrades = true; },
    (config) => { config.bundle.windows.certificateThumbprint = "certificate"; },
    (config) => { config.version = "9.9.9"; },
  ];
  for (const mutate of mutations) {
    const config = structuredClone(reference);
    mutate(config);
    fs.writeFileSync(path.join(directory, "tauri.windows.conf.json"), JSON.stringify(config));
    assert.throws(() => validateWindowsTauriContract(root));
  }
});

test("native Windows inspection script parses before installing an application", { skip: process.platform !== "win32" }, () => {
  const source = fs.readFileSync(fileURLToPath(new URL("./desktop-windows-release.mjs", import.meta.url)), "utf8");
  const script = source.match(/const INSPECT_INSTALLER = String\.raw`([\s\S]*?)`;/)?.[1];
  assert.ok(script, "Windows inspection script exists");
  const parser = `
    $tokens = $null
    $errors = $null
    $script = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:ANTENNABENCH_POWERSHELL_TEST_SCRIPT))
    [Management.Automation.Language.Parser]::ParseInput($script, [ref] $tokens, [ref] $errors) | Out-Null
    if ($errors.Count -gt 0) { $errors | Format-List | Out-String | Write-Error; exit 1 }
  `;
  const result = spawnSync(windowsPowerShellPath(), [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(parser, "utf16le").toString("base64"),
  ], {
    env: nativeWindowsEnvironment({ ...process.env, ANTENNABENCH_POWERSHELL_TEST_SCRIPT: Buffer.from(script).toString("base64") }),
    encoding: "utf8", timeout: 30_000, windowsHide: true,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("Windows PowerShell is resolved independently of the inherited MSYS PATH", () => {
  assert.equal(windowsPowerShellPath({ SYSTEMROOT: "C:\\Windows", PATH: "/usr/bin:/c/tools" }), "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.equal(windowsPowerShellPath({ windir: "D:\\System Files" }), "D:\\System Files\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
});

test("native Windows subprocesses resolve toolchain and system tools from the mise Git Bash environment", { skip: process.platform !== "win32" }, () => {
  const env = nativeWindowsEnvironment();
  assert.equal(Object.keys(env).filter((key) => key.toLowerCase() === "path").length, 1);
  assert.ok(Object.hasOwn(env, "PATH"), "Node command lookup requires options.env.PATH");
  assert.equal(Object.keys(env).filter((key) => key.toLowerCase() === "cargo").length, 1);
  assert.match(env.CARGO, /^[a-z]:[\\/]/i, "Cargo metadata requires a native absolute CARGO override");
  assert.ok(fs.existsSync(env.CARGO), "CARGO must select an existing native executable");
  assert.equal(nativeWindowsEnvironment({ ...process.env, CARGO: "/missing/msys/cargo" }).CARGO, env.CARGO);
  const commands = [
    ["git", ["--version"]],
    ["cargo", ["--version"]],
    ["cargo", ["deny", "--version"]],
    ["cargo", ["metadata", "--locked", "--no-deps", "--format-version", "1"]],
    ["cargo-deny", ["--version"]],
    ["cargo-tauri", ["--version"]],
    ["taskkill.exe", ["/?"]],
  ];
  for (const [command, args] of commands) {
    const result = spawnSync(command, args, {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env, encoding: "utf8", timeout: 30_000, windowsHide: true,
    });
    const candidates = env.PATH.split(";").map((directory) => path.join(directory, command.endsWith(".exe") ? command : `${command}.exe`)).filter((filename) => fs.existsSync(filename));
    assert.equal(result.error, undefined, `${command} must resolve from the native PATH; executable candidates=${candidates.join(", ")}; PATH=${env.PATH}`);
    assert.equal(result.status, 0, `${command} ${args.join(" ")}: ${result.stdout}\n${result.stderr}`);
  }
});
