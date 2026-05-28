import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim()
  };
}

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const checks = [];

function addCheck(name, ok, detail, fix) {
  checks.push({ name, ok, detail, fix });
}

const rustc = run("rustc", ["--version"]);
addCheck(
  "Rust compiler",
  rustc.ok,
  rustc.ok ? rustc.stdout : "rustc nao encontrado",
  "Instale Rust com https://rustup.rs/."
);

const cargo = run("cargo", ["--version"]);
addCheck(
  "Cargo",
  cargo.ok,
  cargo.ok ? cargo.stdout : "cargo nao encontrado",
  "Instale Rust com https://rustup.rs/."
);

const tauriCli = await exists(new URL("../node_modules/.bin/tauri", import.meta.url));
addCheck(
  "Tauri CLI local",
  tauriCli,
  tauriCli ? "node_modules/.bin/tauri encontrado" : "CLI local nao encontrada",
  "Rode npm install na raiz do projeto."
);

if (process.platform === "darwin") {
  const xcode = run("xcode-select", ["-p"]);
  addCheck(
    "Xcode Command Line Tools",
    xcode.ok,
    xcode.ok ? xcode.stdout : "xcode-select nao configurado",
    "Rode xcode-select --install antes de gerar a app macOS."
  );
}

if (process.platform === "win32") {
  const buildTools = run("where", ["cl"]);
  addCheck(
    "MSVC Build Tools",
    buildTools.ok,
    buildTools.ok ? "compilador MSVC encontrado" : "cl.exe nao encontrado",
    "Instale Visual Studio Build Tools com workload Desktop development with C++."
  );
}

console.log("");
console.log("Ops PDF Studio desktop doctor");
console.log("--------------------------------");

for (const check of checks) {
  console.log(`${check.ok ? "[ok]" : "[x]"} ${check.name}: ${check.detail}`);
  if (!check.ok && check.fix) {
    console.log(`     ${check.fix}`);
  }
}

const failed = checks.filter((check) => !check.ok);

if (failed.length > 0) {
  console.log("");
  console.log("Desktop build ainda nao esta pronto.");
  process.exit(1);
}

console.log("");
console.log("Desktop build pronto para rodar npm run desktop:build.");
