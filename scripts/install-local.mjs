// Копирует собранный release-.exe в постоянную папку и создаёт ярлыки.
// Запускается автоматически из `npm run release` после `tauri build`.
//
// Путь к .exe всегда один и тот же:
//   %LOCALAPPDATA%\Programs\Liquid Player\Liquid Player.exe
// Поэтому ярлык на панели задач продолжает работать после каждой новой сборки.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Где cargo держит сборку (у нас она вынесена из OneDrive, см. .cargo/config.toml)
const metadata = JSON.parse(
  execFileSync("cargo", ["metadata", "--format-version", "1", "--no-deps"], {
    cwd: join(projectRoot, "src-tauri"),
    maxBuffer: 64 * 1024 * 1024,
  }).toString(),
);
const builtExe = join(metadata.target_directory, "release", "liquid-player.exe");
if (!existsSync(builtExe)) {
  console.error(`Не найден собранный файл: ${builtExe}`);
  process.exit(1);
}

const installDir = join(process.env.LOCALAPPDATA, "Programs", "Liquid Player");
const installedExe = join(installDir, "Liquid Player.exe");
mkdirSync(installDir, { recursive: true });

try {
  copyFileSync(builtExe, installedExe);
} catch (e) {
  if (e.code === "EBUSY" || e.code === "EPERM") {
    console.error("\n  Liquid Player сейчас открыт — закройте его и запустите npm run release ещё раз.\n");
    process.exit(1);
  }
  throw e;
}

// Ярлыки в меню «Пуск» и на рабочем столе — создаются только если их ещё нет
// (если вы удалили ярлык с рабочего стола, он не появится снова).
const ps = `
$shell = New-Object -ComObject WScript.Shell
$links = @(
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Liquid Player.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Liquid Player.lnk')
)
foreach ($link in $links) {
  if (Test-Path -LiteralPath $link) { continue }
  $sc = $shell.CreateShortcut($link)
  $sc.TargetPath = $env:LP_EXE
  $sc.WorkingDirectory = $env:LP_DIR
  $sc.IconLocation = "$($env:LP_EXE),0"
  $sc.Description = 'Liquid Player'
  $sc.Save()
  Write-Output "  ярлык создан: $link"
}
`;
execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {
  stdio: "inherit",
  env: { ...process.env, LP_EXE: installedExe, LP_DIR: installDir },
});

console.log(`\n  Готово: ${installedExe}\n`);
