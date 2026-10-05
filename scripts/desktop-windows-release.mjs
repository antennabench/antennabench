import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const WINDOWS_TARGET = "x86_64-pc-windows-msvc";
export const WINDOWS_RUNNER = "windows-2025";
const PRODUCT = "AntennaBench";
const BUNDLE_IDENTIFIER = "com.rwjblue.antennabench";
const EXECUTABLE = "antennabench-desktop.exe";
const NOTICES = "THIRD_PARTY_NOTICES.txt";
const NOTICES_SHA256 = "735de7292f06881314cd7c94270871f67dca34d053f543fc498733205eb6050c";
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function assertTarget(target) {
  if (target !== WINDOWS_TARGET) throw new Error(`unsupported Windows release target: ${target}`);
}

export function validateWindowsHost(target, runnerLabel = "local") {
  assertTarget(target);
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Windows installer building and verification require a native Windows x64 host");
  }
  if (!["local", WINDOWS_RUNNER].includes(runnerLabel)) {
    throw new Error(`Windows release runner must be ${WINDOWS_RUNNER} or local: ${runnerLabel}`);
  }
  // Windows 11 and Server 2025 share NT version 10.0; the build is the useful boundary.
  const [major, , build] = os.release().split(".").map(Number);
  if (major < 10 || (major === 10 && build < 22000)) {
    throw new Error(`Windows release verification requires Windows 11 APIs (build 22000+): ${os.release()}`);
  }
}

export function validateWindowsTauriContract(root) {
  const filename = path.join(root, "apps", "desktop", "tauri.windows.conf.json");
  const config = JSON.parse(fs.readFileSync(filename, "utf8"));
  const windows = config.bundle?.windows;
  if (JSON.stringify(config.bundle?.targets) !== '["nsis"]') {
    throw new Error("Windows Tauri bundling must produce only the NSIS installer");
  }
  if (config.bundle.publisher !== "rwjblue") {
    throw new Error("Windows installer publisher must match its registry cleanup contract: rwjblue");
  }
  if (
    windows?.nsis?.installMode !== "currentUser" ||
    windows?.webviewInstallMode?.type !== "offlineInstaller" ||
    windows?.webviewInstallMode?.silent !== true ||
    windows?.allowDowngrades !== false
  ) {
    throw new Error("Windows installer must be per-user, include offline WebView2, and reject downgrades");
  }
  if (windows.certificateThumbprint || windows.signCommand || windows.timestampUrl) {
    throw new Error("Windows release policy requires unsigned application and installer binaries");
  }
  if (Object.hasOwn(config, "version")) {
    throw new Error("Windows Tauri configuration must inherit the Cargo workspace version");
  }
  return config;
}

function environmentValue(env, name) {
  return Object.entries(env).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}

export function windowsPowerShellPath(env = process.env) {
  const root = environmentValue(env, "SystemRoot") ?? environmentValue(env, "WINDIR");
  if (!root) throw new Error("Windows native tools require the SystemRoot environment variable");
  return path.win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function captureRaw(command, args, options = {}) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: "utf8",
    timeout: options.timeout ?? 30_000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed (${result.error?.message ?? `exit ${result.status}`})${output ? `:\n${output}` : ""}`);
  }
  return (result.stdout ?? "").trim();
}

function windowsGitBashPath(env) {
  const roots = [
    environmentValue(env, "EXEPATH"),
    environmentValue(env, "ProgramW6432") && path.win32.join(environmentValue(env, "ProgramW6432"), "Git"),
    environmentValue(env, "ProgramFiles") && path.win32.join(environmentValue(env, "ProgramFiles"), "Git"),
    environmentValue(env, "LOCALAPPDATA") && path.win32.join(environmentValue(env, "LOCALAPPDATA"), "Programs", "Git"),
  ].filter(Boolean);
  for (const root of roots) {
    const candidate = path.win32.join(root, "bin", "bash.exe");
    if (fs.existsSync(candidate)) return candidate;
  }
  const script = String.raw`
    $ErrorActionPreference = 'Stop'
    foreach ($key in @('HKCU:\Software\GitForWindows', 'HKLM:\Software\GitForWindows')) {
      $root = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).InstallPath
      if ($root) {
        $candidate = Join-Path $root 'bin\bash.exe'
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { Write-Output $candidate; exit 0 }
      }
    }
    throw 'Git Bash is required to convert the mise/MSYS PATH for native Windows subprocesses.'
  `;
  return captureRaw(windowsPowerShellPath(env), [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64"),
  ], { env });
}

const nativeToolchainCache = new Map();

export function nativeWindowsEnvironment(env = process.env) {
  if (process.platform !== "win32") return env;
  const paths = Object.entries(env).filter(([key]) => key.toLowerCase() === "path").map(([, value]) => value);
  const key = JSON.stringify([paths, environmentValue(env, "CARGO_HOME"), environmentValue(env, "RUSTUP_TOOLCHAIN")]);
  let native = nativeToolchainCache.get(key);
  if (!native) {
    // Use the same exact cargo directory discovery as desktop:build. A mise
    // task can expose both stale native PATH and current MSYS PATH spellings;
    // choosing the native-looking value loses the activated Rust toolchain.
    const output = captureRaw(windowsGitBashPath(env), ["-c", [
      "set -e",
      'cargo="$(command -v cargo)"',
      '/usr/bin/cygpath -w "$cargo"',
      '/usr/bin/cygpath -wp "$PATH"',
    ].join("\n")], { env });
    const [cargo, convertedPath] = output.split(/\r?\n/);
    if (!cargo || !convertedPath || !/^[a-z]:[\\/]/i.test(cargo)) {
      throw new Error("Git Bash did not resolve the native cargo executable and Windows PATH");
    }
    const cargoExecutable = fs.existsSync(cargo) ? cargo : `${cargo}.exe`;
    if (!fs.existsSync(cargoExecutable)) {
      throw new Error(`Git Bash resolved a missing native cargo executable: ${cargo}`);
    }
    native = { cargo: cargoExecutable, path: `${path.win32.dirname(cargoExecutable)};${convertedPath}` };
    nativeToolchainCache.set(key, native);
  }
  // Windows treats PATH and Path as the same variable. Node's command lookup
  // specifically reads options.env.PATH, so retain only that uppercase spelling.
  const result = { ...env };
  for (const key of Object.keys(result)) {
    if (["path", "cargo"].includes(key.toLowerCase())) delete result[key];
  }
  result.PATH = native.path;
  // cargo_metadata honors CARGO before PATH, so replace an inherited MSYS
  // override with the same exact native executable selected above.
  result.CARGO = native.cargo;
  return result;
}

function capture(command, args, options = {}) {
  return captureRaw(command, args, { ...options, env: nativeWindowsEnvironment(options.env ?? process.env) });
}

function powershell(script, env, timeout) {
  return capture(windowsPowerShellPath(env), [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
    Buffer.from(`$ErrorActionPreference = 'Stop'\n[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n${script}`, "utf16le").toString("base64"),
  ], { env, timeout });
}

async function runBounded(command, args, { cwd, env, timeout, label }) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: nativeWindowsEnvironment(env), stdio: "inherit", windowsHide: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { env: nativeWindowsEnvironment(env), timeout: 30_000 });
    }, timeout);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`${label} could not start: ${error.message}`));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`${label} exceeded ${timeout / 1000} seconds`));
      else if (code !== 0) reject(new Error(`${label} failed with exit ${code}`));
      else resolve();
    });
  });
}

function nativeBuildEnvironment(env) {
  // Git Bash finds mise's installed executables before Windows PATH resolution does.
  // Convert its complete PATH and exact cargo location, matching desktop:build.
  if (env.MSYSTEM) {
    const output = capture(windowsGitBashPath(env), ["-c", [
      'cygpath -w "$(command -v cargo)"',
      'cygpath -w "$(command -v cargo-tauri)"',
      'cygpath -wp "$PATH"',
    ].join("\n")], { env });
    const [cargo, tauri, nativePath] = output.split(/\r?\n/);
    if (!cargo || !tauri || !nativePath) throw new Error("could not resolve native Windows cargo/Tauri toolchain paths");
    const buildEnv = { ...env };
    for (const key of Object.keys(buildEnv)) {
      if (key.toLowerCase() === "path") delete buildEnv[key];
    }
    buildEnv.PATH = `${path.dirname(cargo)};${nativePath}`;
    return { command: tauri, env: buildEnv };
  }
  return { command: "cargo-tauri.exe", env };
}

export async function buildWindowsInstaller({ root, target, version, source, tag, env = process.env }) {
  validateWindowsHost(target);
  validateWindowsTauriContract(root);
  if (!STABLE_VERSION.test(version) || tag !== `v${version}` || source?.dirty !== false || !source?.commit) {
    throw new Error("Windows official build requires a stable version, matching tag, and clean source commit");
  }
  const directory = path.join(root, "target", target, "release", "bundle", "nsis");
  fs.rmSync(directory, { recursive: true, force: true });
  const native = nativeBuildEnvironment({
    ...env,
    ANTENNABENCH_BUILD_CHANNEL: "official_release",
    ANTENNABENCH_SOURCE_COMMIT: source.commit,
    ANTENNABENCH_SOURCE_STATE: "clean",
    ANTENNABENCH_RELEASE_TAG: tag,
    ANTENNABENCH_TARGET_TRIPLE: target,
    ANTENNABENCH_BUILD_ARCHITECTURE: "x86_64",
  });
  await runBounded(native.command, [
    "build", "--target", target, "--bundles", "nsis", "--ci", "--no-sign",
    "--config", "tauri.windows.conf.json",
  ], {
    cwd: path.join(root, "apps", "desktop"), env: native.env,
    timeout: 1_800_000, label: `Windows NSIS release build for ${target}`,
  });
  const installers = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((filename) => filename.endsWith("-setup.exe"))
    : [];
  if (installers.length !== 1) {
    throw new Error(`Tauri must produce exactly one NSIS setup.exe in ${directory}; found ${installers.join(", ") || "none"}`);
  }
  return path.join(directory, installers[0]);
}

export function readPeHeader(filename) {
  const descriptor = fs.openSync(filename, "r");
  const size = fs.fstatSync(descriptor).size;
  function read(offset, count) {
    if (offset < 0 || offset + count > size) throw new Error(`truncated PE header: ${filename}`);
    const buffer = Buffer.alloc(count);
    if (fs.readSync(descriptor, buffer, 0, count, offset) !== count) {
      throw new Error(`could not read PE header: ${filename}`);
    }
    return buffer;
  }
  try {
    const dos = read(0, 64);
    if (dos.toString("ascii", 0, 2) !== "MZ") throw new Error(`missing DOS executable header: ${filename}`);
    const offset = dos.readUInt32LE(0x3c);
    if (offset < 64) throw new Error(`invalid PE header offset: ${filename}`);
    const coff = read(offset, 24);
    if (!coff.subarray(0, 4).equals(Buffer.from([0x50, 0x45, 0, 0]))) {
      throw new Error(`missing PE executable signature: ${filename}`);
    }
    const machine = coff.readUInt16LE(4);
    const optionalSize = coff.readUInt16LE(20);
    if (optionalSize < 144 || optionalSize > 4096) throw new Error(`invalid PE optional header length: ${filename}`);
    const optional = read(offset + 24, optionalSize);
    const magic = optional.readUInt16LE(0);
    const architecture = machine === 0x8664 ? "x86_64" : machine === 0x14c ? "x86" : null;
    if (!architecture || magic !== (architecture === "x86_64" ? 0x20b : 0x10b)) {
      throw new Error(`unsupported PE machine or optional header: ${filename}`);
    }
    const directories = architecture === "x86_64" ? 112 : 96;
    if (optional.readUInt32LE(directories - 4) < 5 || optionalSize < directories + 40) {
      throw new Error(`PE header does not describe its certificate table: ${filename}`);
    }
    const certificateOffset = optional.readUInt32LE(directories + 32);
    const certificateSize = optional.readUInt32LE(directories + 36);
    return {
      architecture,
      machine: `0x${machine.toString(16).padStart(4, "0")}`,
      has_authenticode_certificate: certificateOffset !== 0 || certificateSize !== 0,
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

const INSPECT_INSTALLER = String.raw`
$installer = $env:ANTENNABENCH_INSPECT_INSTALLER
$destination = $env:ANTENNABENCH_INSPECT_DIRECTORY
$product = 'AntennaBench'
$identifier = 'com.rwjblue.antennabench'
$registryPath = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\AntennaBench'
$productRegistryPath = 'HKCU:\Software\rwjblue\AntennaBench'
$existingRegistry = @("HKCU:\$registryPath", "HKLM:\$registryPath", "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\AntennaBench", $productRegistryPath)
foreach ($entry in $existingRegistry) {
  if (Test-Path -LiteralPath $entry) { throw 'Use a clean Windows test user or runner: AntennaBench is already installed.' }
}
$dataDirectories = @((Join-Path ([Environment]::GetFolderPath('ApplicationData')) $identifier), (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) $identifier))
foreach ($entry in $dataDirectories) {
  if (Test-Path -LiteralPath $entry) { throw 'Use a clean Windows test user or runner: AntennaBench application data already exists.' }
}
if (Get-Process -Name 'antennabench-desktop' -ErrorAction SilentlyContinue) { throw 'Close AntennaBench before verifying the Windows installer.' }

function Read-BinaryEvidence([string] $filename) {
  $stream = [IO.File]::OpenRead($filename)
  $reader = [IO.BinaryReader]::new($stream)
  try {
    if ($reader.ReadUInt16() -ne 0x5a4d) { throw "Missing DOS executable header: $filename" }
    $stream.Position = 0x3c
    $peOffset = $reader.ReadUInt32()
    $stream.Position = $peOffset
    if ($reader.ReadUInt32() -ne 0x4550) { throw "Missing PE executable signature: $filename" }
    $machine = $reader.ReadUInt16()
    if ($machine -notin @(0x014c, 0x8664)) { throw "Unsupported PE executable architecture: $filename" }
    $stream.Position = $peOffset + 24
    $magic = $reader.ReadUInt16()
    $directories = if ($machine -eq 0x8664 -and $magic -eq 0x020b) { 112 } elseif ($machine -eq 0x014c -and $magic -eq 0x010b) { 96 } else { throw "PE executable architecture disagrees with optional header: $filename" }
    $stream.Position = $peOffset + 24 + $directories + 32
    if ($reader.ReadUInt32() -ne 0 -or $reader.ReadUInt32() -ne 0) { throw "Windows release requires no embedded Authenticode certificate: $filename" }
  } finally { $reader.Dispose(); $stream.Dispose() }
  $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($filename)
  $signature = Get-AuthenticodeSignature -LiteralPath $filename
  if ($signature.Status.ToString() -ne 'NotSigned' -or $null -ne $signature.SignerCertificate) {
    throw "Windows release policy requires an unsigned binary: $filename ($($signature.Status))"
  }
  return @{ file_version = $version.FileVersion; product_version = $version.ProductVersion; product_name = $version.ProductName; authenticode_status = $signature.Status.ToString(); machine = ('0x{0:x4}' -f $machine); sha256 = (Get-FileHash -LiteralPath $filename -Algorithm SHA256).Hash.ToLowerInvariant() }
}

function Run-Installer([string] $filename, [string] $arguments, [int] $timeoutSeconds) {
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $filename
  # NSIS requires /D= and _?= to be the last argument, without enclosing quotes.
  $start.Arguments = $arguments
  $start.UseShellExecute = $false
  $process = [Diagnostics.Process]::Start($start)
  try {
    if (!$process.WaitForExit($timeoutSeconds * 1000)) {
      & taskkill.exe /PID $process.Id /T /F | Out-Null
      throw "Installer operation exceeded $timeoutSeconds seconds: $filename"
    }
    if ($process.ExitCode -ne 0) { throw "Installer operation failed with exit $($process.ExitCode): $filename" }
  } finally { $process.Dispose() }
}

$installerEvidence = Read-BinaryEvidence $installer
$app = $null
$webviewIds = @()
$evidence = $null
try {
  Run-Installer $installer ("/S /NS /D=" + $destination) 300
  $executable = Join-Path $destination 'antennabench-desktop.exe'
  $notices = Join-Path $destination 'THIRD_PARTY_NOTICES.txt'
  $uninstaller = Join-Path $destination 'uninstall.exe'
  foreach ($entry in @($executable, $notices, $uninstaller)) {
    if (!(Test-Path -LiteralPath $entry -PathType Leaf)) { throw "Installed resource is missing: $entry" }
  }
  $registration = Get-ItemProperty -LiteralPath "HKCU:\$registryPath"
  if ($registration.DisplayName -ne $product -or $registration.DisplayVersion -ne $env:ANTENNABENCH_INSPECT_VERSION) { throw 'Installed application registration does not match product/version.' }
  if ($registration.InstallLocation.Trim('"') -ne $destination) { throw 'The installer did not honor the temporary installation directory.' }
  $executableEvidence = Read-BinaryEvidence $executable
  $noticesHash = (Get-FileHash -LiteralPath $notices -Algorithm SHA256).Hash.ToLowerInvariant()
  $app = Start-Process -FilePath $executable -PassThru
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  $windowReady = $false
  do {
    Start-Sleep -Milliseconds 500
    $app.Refresh()
    if ($app.HasExited) { throw "Installed AntennaBench exited before creating a native window (exit $($app.ExitCode))." }
    $webviews = @(Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" | Where-Object { $_.ParentProcessId -eq $app.Id })
    if ($app.MainWindowHandle -ne [IntPtr]::Zero -and $app.MainWindowTitle -eq $product -and $webviews.Count -gt 0) {
      $windowReady = $true
      $webviewIds = @($webviews.ProcessId)
      break
    }
  } while ([DateTime]::UtcNow -lt $deadline)
  if (!$windowReady) { throw 'Installed AntennaBench did not create its native window with WebView2 within 60 seconds.' }
  $app.CloseMainWindow() | Out-Null
  if (!$app.WaitForExit(15000)) {
    & taskkill.exe /PID $app.Id /T /F | Out-Null
    throw 'Installed AntennaBench did not exit when its main window closed.'
  }
  $app.Dispose()
  $app = $null
  $evidence = @{ installer = $installerEvidence; executable = $executableEvidence; notices_sha256 = $noticesHash; launch = 'passed' }
} finally {
  $cleanupErrors = [Collections.Generic.List[string]]::new()
  if ($null -ne $app) {
    try {
      if (!$app.HasExited) { & taskkill.exe /PID $app.Id /T /F | Out-Null }
      $app.Dispose()
    } catch { $cleanupErrors.Add($_.Exception.Message) }
  }
  foreach ($processId in $webviewIds) {
    try {
      if (Get-Process -Id $processId -ErrorAction SilentlyContinue) { & taskkill.exe /PID $processId /T /F | Out-Null }
    } catch { $cleanupErrors.Add($_.Exception.Message) }
  }
  $uninstaller = Join-Path $destination 'uninstall.exe'
  if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
    try { Run-Installer $uninstaller ("/S _?=" + $destination) 120 }
    catch { $cleanupErrors.Add($_.Exception.Message) }
  }
  if ((Test-Path -LiteralPath (Join-Path $destination 'antennabench-desktop.exe')) -or (Test-Path -LiteralPath "HKCU:\$registryPath")) {
    $cleanupErrors.Add('Windows uninstall verification failed: application or registration remains.')
  } else {
    # Silent NSIS uninstall retains its last-install location; it must not point at the test directory.
    try {
      if (Test-Path -LiteralPath $productRegistryPath) { Remove-Item -LiteralPath $productRegistryPath -Recurse -Force }
    } catch { $cleanupErrors.Add($_.Exception.Message) }
  }
  # These directories were absent before this inspection, so remove smoke-run data.
  foreach ($entry in $dataDirectories) {
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while ((Test-Path -LiteralPath $entry) -and [DateTime]::UtcNow -lt $deadline) {
      Remove-Item -LiteralPath $entry -Recurse -Force -ErrorAction SilentlyContinue
      if (Test-Path -LiteralPath $entry) { Start-Sleep -Milliseconds 500 }
    }
    if (Test-Path -LiteralPath $entry) { $cleanupErrors.Add("Smoke-test application data remains: $entry") }
  }
  if ($cleanupErrors.Count -gt 0) {
    throw ("Windows installer cleanup failed. Recovery uninstaller is retained at $destination. " + ($cleanupErrors -join ' '))
  }
  New-Item -ItemType File -Path (Join-Path (Split-Path -Parent $destination) 'cleanup-complete') | Out-Null
}
$evidence | ConvertTo-Json -Depth 8 -Compress
`;

function assertBinaryVersion(evidence, version, context) {
  for (const field of ["file_version", "product_version"]) {
    if (![version, `${version}.0`].includes(evidence[field])) {
      throw new Error(`${context} ${field} mismatch: expected ${version}, found ${evidence[field]}`);
    }
  }
  if (evidence.product_name !== PRODUCT) {
    throw new Error(`${context} ProductName mismatch: expected ${PRODUCT}, found ${evidence.product_name}`);
  }
  if (evidence.authenticode_status !== "NotSigned") throw new Error(`${context} is not unsigned`);
}

export function inspectWindowsInstaller(installer, { target, version, trustMode }) {
  validateWindowsHost(target);
  if (!STABLE_VERSION.test(version)) throw new Error(`Windows release version must be stable MAJOR.MINOR.PATCH: ${version}`);
  if (!["local", "release"].includes(trustMode)) throw new Error(`unsupported Windows trust mode: ${trustMode}`);
  installer = path.resolve(installer);
  const installerPe = readPeHeader(installer);
  // NSIS's launcher is x86 even when it carries a native x64 application.
  if (installerPe.architecture !== "x86" || installerPe.has_authenticode_certificate) {
    throw new Error("Windows release requires an unsigned x86 NSIS launcher containing a native x64 application");
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "antennabench-installer-"));
  const destination = path.join(temporary, "app");
  try {
    const native = JSON.parse(powershell(INSPECT_INSTALLER, {
      ...process.env,
      ANTENNABENCH_INSPECT_INSTALLER: installer,
      ANTENNABENCH_INSPECT_DIRECTORY: destination,
      ANTENNABENCH_INSPECT_VERSION: version,
    }, 600_000));
    // Native evidence is collected before the script uninstalls the application.
    assertBinaryVersion(native.installer, version, "NSIS installer");
    assertBinaryVersion(native.executable, version, "Installed executable");
    if (native.installer.machine !== "0x014c" || native.executable.machine !== "0x8664") {
      throw new Error("Windows installer must contain a native x64 executable in an x86 NSIS launcher");
    }
    if (native.notices_sha256 !== NOTICES_SHA256) throw new Error("installed third-party notices do not match the reviewed license text");
    const signature = {
      classification: "unsigned", authorities: [], publishable: trustMode === "release", secure_timestamp: false,
    };
    return {
      architecture: "x86_64",
      metadata: {
        build_version: version, short_version: version, product_name: native.executable.product_name,
        bundle_identifier: BUNDLE_IDENTIFIER, minimum_windows: "11", executable: EXECUTABLE,
      },
      installer: {
        architecture: installerPe.architecture, machine: installerPe.machine, format: "nsis", install_mode: "currentUser",
        webview_install_mode: "offlineInstaller", ...native.installer,
      },
      executable: { filename: EXECUTABLE, ...native.executable },
      third_party_notices: { filename: NOTICES, sha256: native.notices_sha256 },
      signature,
      executable_signature: { ...signature },
      installation: { silent_install: "passed", native_window_webview2: native.launch, silent_uninstall: "passed" },
    };
  } catch (error) {
    if (fs.existsSync(destination) && !fs.existsSync(path.join(temporary, "cleanup-complete"))) {
      throw new Error(`${error.message}\nInstaller recovery files were retained at ${destination}; remove the test installation with its uninstall.exe before retrying.`);
    }
    throw error;
  } finally {
    if (!fs.existsSync(destination) || fs.existsSync(path.join(temporary, "cleanup-complete"))) {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
}
