//! Команды Tauri для плейлистов и истории прослушиваний.
//! Каждая команда меняет базу в фоновом потоке и возвращает новое состояние.

use tauri::{AppHandle, Manager};

use super::{clean_name, db, HistoryItem, Playlist};
use crate::library::Library;

#[tauri::command]
pub async fn playlists_list(app: AppHandle) -> Result<Vec<Playlist>, String> {
    blocking(app, |lib| lib.with_db(db::list)).await
}

/// Новый плейлист (можно сразу с песнями).
#[tauri::command]
pub async fn playlist_create(app: AppHandle, name: String, track_ids: Vec<String>) -> Result<Playlist, String> {
    let name = clean_name(&name)?;
    blocking(app, move |lib| {
        let id = lib.with_db(|c| db::create(c, &name, &track_ids))?;
        load(lib, id)
    })
    .await
}

#[tauri::command]
pub async fn playlist_rename(app: AppHandle, id: i64, name: String) -> Result<Playlist, String> {
    let name = clean_name(&name)?;
    blocking(app, move |lib| {
        lib.with_db(|c| db::rename(c, id, &name))?;
        load(lib, id)
    })
    .await
}

/// Удалить плейлист. Песни остаются в библиотеке.
#[tauri::command]
pub async fn playlist_delete(app: AppHandle, id: i64) -> Result<(), String> {
    blocking(app, move |lib| lib.with_db(|c| db::delete(c, id))).await
}

#[tauri::command]
pub async fn playlist_add_tracks(app: AppHandle, id: i64, track_ids: Vec<String>) -> Result<Playlist, String> {
    blocking(app, move |lib| {
        lib.with_db(|c| db::add_tracks(c, id, &track_ids))?;
        load(lib, id)
    })
    .await
}

#[tauri::command]
pub async fn playlist_remove_tracks(app: AppHandle, id: i64, track_ids: Vec<String>) -> Result<Playlist, String> {
    blocking(app, move |lib| {
        lib.with_db(|c| db::remove_tracks(c, id, &track_ids))?;
        load(lib, id)
    })
    .await
}

/// `track_ids` — все песни плейлиста в новом порядке.
#[tauri::command]
pub async fn playlist_reorder(app: AppHandle, id: i64, track_ids: Vec<String>) -> Result<Playlist, String> {
    blocking(app, move |lib| {
        lib.with_db(|c| db::reorder(c, id, &track_ids))?;
        load(lib, id)
    })
    .await
}

// ---------- История ----------

/// Отметить, что песню послушали (интерфейс вызывает после 30 с или половины песни).
#[tauri::command]
pub async fn history_add(app: AppHandle, track_id: String) -> Result<(), String> {
    blocking(app, move |lib| lib.with_db(|c| db::history_add(c, &track_id))).await
}

#[tauri::command]
pub async fn history_recent(app: AppHandle, limit: Option<i64>) -> Result<Vec<HistoryItem>, String> {
    let limit = limit.unwrap_or(60).clamp(1, 500);
    blocking(app, move |lib| lib.with_db(|c| db::history_recent(c, limit))).await
}

#[tauri::command]
pub async fn history_remove(app: AppHandle, track_id: String) -> Result<(), String> {
    blocking(app, move |lib| lib.with_db(|c| db::history_remove(c, &track_id))).await
}

#[tauri::command]
pub async fn history_clear(app: AppHandle) -> Result<(), String> {
    blocking(app, |lib| lib.with_db(db::history_clear)).await
}

fn load(lib: &Library, id: i64) -> Result<Playlist, String> {
    lib.with_db(|c| db::get(c, id))?
        .ok_or_else(|| "Плейлист не найден".to_string())
}

async fn blocking<T, F>(app: AppHandle, f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&Library) -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || f(&app.state::<Library>()))
        .await
        .map_err(|e| e.to_string())?
}
