//! Команды Tauri для библиотеки и оформления треков.
//!
//! Работа с диском, базой и картинками может занять время (импорт папки,
//! сжатие большой фотографии), поэтому всё выполняется в фоновом потоке
//! (spawn_blocking), а окно в это время остаётся отзывчивым.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Emitter, Manager};

use super::appearance::ImageKind;
use super::import::{self, ImportSummary};
use super::{events, Library, Track};

#[tauri::command]
pub async fn library_list(app: AppHandle) -> Result<Vec<Track>, String> {
    in_background(app, |_, lib| lib.list()).await
}

/// `paths` — файлы и/или папки (из диалога или перетаскивания).
/// Для новых песен сразу запускается фоновый поиск текстов на lrclib.net.
#[tauri::command]
pub async fn library_import(app: AppHandle, paths: Vec<String>) -> Result<ImportSummary, String> {
    let inputs: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    let summary = in_background(app.clone(), move |app, lib| import::run(app, lib, inputs)).await?;
    crate::lyrics::service::enqueue(&app, summary.added_ids.clone());
    Ok(summary)
}

/// Изменить название, исполнителя и альбом (только в библиотеке).
#[tauri::command]
pub async fn track_update_info(
    app: AppHandle,
    id: String,
    title: String,
    artist: String,
    album: String,
) -> Result<Track, String> {
    in_background(app, move |_, lib| lib.update_info(&id, &title, &artist, &album)).await
}

/// Вернуть название, исполнителя и альбом из тегов файла.
#[tauri::command]
pub async fn track_reset_info(app: AppHandle, id: String) -> Result<Track, String> {
    in_background(app, move |_, lib| lib.reset_info(&id)).await
}

/// Убирает треки из библиотеки (файлы на диске остаются).
#[tauri::command]
pub async fn library_remove(app: AppHandle, ids: Vec<String>) -> Result<(), String> {
    in_background(app, move |app, lib| {
        lib.remove(&ids)?;
        let _ = app.emit(events::CHANGED, ());
        Ok(())
    })
    .await
}

// ---------- Оформление (этап 4) ----------

/// Своя обложка или свой фон из картинки `source`. Возвращает обновлённый трек.
/// В JS: invoke("appearance_set_image", { id, kind: "cover" | "background", source })
#[tauri::command]
pub async fn appearance_set_image(
    app: AppHandle,
    id: String,
    kind: ImageKind,
    source: String,
) -> Result<Track, String> {
    in_background(app, move |_, lib| lib.set_image(&id, kind, Path::new(&source))).await
}

/// Вернуть обложку из файла / размытую обложку вместо своего фона.
#[tauri::command]
pub async fn appearance_reset_image(app: AppHandle, id: String, kind: ImageKind) -> Result<Track, String> {
    in_background(app, move |_, lib| lib.reset_image(&id, kind)).await
}

/// Затемнение 0..1 и размытие 0..60 px.
#[tauri::command]
pub async fn appearance_set_params(app: AppHandle, id: String, dim: f64, blur: f64) -> Result<(), String> {
    in_background(app, move |_, lib| lib.set_params(&id, dim, blur)).await
}

/// Выполнить `f` в фоновом потоке, передав ему библиотеку из состояния приложения.
async fn in_background<T, F>(app: AppHandle, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&AppHandle, &Library) -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let lib = app.state::<Library>();
        f(&app, &lib)
    })
    .await
    .map_err(|e| e.to_string())?
}
