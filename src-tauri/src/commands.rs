//! Команды — Rust-функции, которые фронтенд вызывает через `invoke("имя")`.

use serde::Serialize;
use tauri::Manager; // даёт метод app.path()

/// Ответ команды `app_info`. Serialize превращает структуру в JSON,
/// rename_all = "camelCase" — чтобы в TypeScript поля были dataDir, а не data_dir.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    name: String,
    version: String,
    tauri_version: String,
    data_dir: String,
}

/// Проверка связи фронтенд ↔ Rust. Заодно показывает папку данных приложения,
/// куда позже положим базу треков, обложки и тексты.
#[tauri::command]
pub fn app_info(app: tauri::AppHandle) -> Result<AppInfo, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("не удалось определить папку данных: {e}"))?;

    let pkg = app.package_info();
    Ok(AppInfo {
        name: pkg.name.clone(),
        version: pkg.version.to_string(),
        tauri_version: tauri::VERSION.to_string(),
        data_dir: data_dir.display().to_string(),
    })
}
