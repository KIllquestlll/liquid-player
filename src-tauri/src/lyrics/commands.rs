//! Команды Tauri для текстов песен.

use tauri::{AppHandle, Emitter, Manager};

use super::service::{self, Changed, LyricsService};
use super::{db, decode_text, events, lrc, lrclib, LyricsData};
use crate::library::Library;

/// Текст трека (уже разобранный на строки).
#[tauri::command]
pub async fn lyrics_get(app: AppHandle, track_id: String) -> Result<LyricsData, String> {
    blocking(app, move |_, lib| load(lib, &track_id)).await
}

/// Поставить треки в очередь автопоиска (прогресс — событием lyrics-progress).
#[tauri::command]
pub fn lyrics_fetch(app: AppHandle, track_ids: Vec<String>) {
    service::enqueue(&app, track_ids);
}

/// Найти тексты для всех песен, у которых их ещё нет. Возвращает, сколько поставлено в очередь.
#[tauri::command]
pub async fn lyrics_fetch_missing(app: AppHandle) -> Result<usize, String> {
    let ids = blocking(app.clone(), |_, lib| lib.with_db(db::ids_without_lyrics)).await?;
    let count = ids.len();
    service::enqueue(&app, ids);
    Ok(count)
}

#[tauri::command]
pub fn lyrics_cancel(app: AppHandle) {
    service::cancel(&app);
}

/// Ручной поиск в Админ-панели: список кандидатов с lrclib.net.
#[tauri::command]
pub async fn lyrics_search(app: AppHandle, title: String, artist: Option<String>) -> Result<Vec<lrclib::Candidate>, String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("Введите название песни".into());
    }
    let artist = artist.map(|a| a.trim().to_string()).filter(|a| !a.is_empty());
    let svc = app.state::<LyricsService>();
    let mut results = svc.client.search(&title, artist.as_deref()).await?;
    if results.is_empty() {
        if let Some(artist) = &artist {
            results = svc.client.search(&format!("{artist} {title}"), None).await?;
        }
    }
    // Сначала с синхронизированным текстом
    results.sort_by_key(|r| r.synced().is_none());
    Ok(results.iter().take(20).map(lrclib::Candidate::from).collect())
}

/// Взять выбранный в списке текст с lrclib.net.
#[tauri::command]
pub async fn lyrics_apply(app: AppHandle, track_id: String, lrclib_id: i64) -> Result<LyricsData, String> {
    let record = app.state::<LyricsService>().client.get_by_id(lrclib_id).await?;
    blocking(app, move |app, lib| {
        let status = if record.synced().is_some() || record.plain().is_some() { "found" } else { "instrumental" };
        lib.with_db(|c| db::save(c, &track_id, record.synced(), record.plain(), "lrclib", status, Some(record.id)))?;
        notify(app, lib, &track_id)
    })
    .await
}

/// Загрузить .lrc / .txt с диска.
#[tauri::command]
pub async fn lyrics_import_file(app: AppHandle, track_id: String, path: String) -> Result<LyricsData, String> {
    blocking(app, move |app, lib| {
        let bytes = std::fs::read(&path).map_err(|e| format!("Не удалось прочитать файл: {e}"))?;
        save_text(lib, &track_id, &decode_text(&bytes), "file")?;
        notify(app, lib, &track_id)
    })
    .await
}

/// Сохранить текст из редактора или ручной разметки.
/// Есть строки с [мм:сс.сс] — сохраняется как синхронизированный, иначе как обычный.
#[tauri::command]
pub async fn lyrics_save(app: AppHandle, track_id: String, text: String, source: String) -> Result<LyricsData, String> {
    let source = if source == "manual" { "manual" } else { "edited" };
    blocking(app, move |app, lib| {
        save_text(lib, &track_id, &text, source)?;
        notify(app, lib, &track_id)
    })
    .await
}

/// Сдвиг синхронизации всего текста, мс (+ позже, − раньше).
#[tauri::command]
pub async fn lyrics_set_offset(app: AppHandle, track_id: String, offset_ms: i64) -> Result<(), String> {
    let offset_ms = offset_ms.clamp(-30_000, 30_000);
    blocking(app, move |_, lib| lib.with_db(|c| db::set_offset(c, &track_id, offset_ms))).await
}

/// Удалить текст. Автопоиск после этого его не вернёт (найти можно вручную).
#[tauri::command]
pub async fn lyrics_clear(app: AppHandle, track_id: String) -> Result<LyricsData, String> {
    blocking(app, move |app, lib| {
        lib.with_db(|c| db::save(c, &track_id, None, None, "manual", "cleared", None))?;
        notify(app, lib, &track_id)
    })
    .await
}

// ---------- вспомогательное ----------

fn load(lib: &Library, track_id: &str) -> Result<LyricsData, String> {
    let row = lib.with_db(|c| db::get(c, track_id))?;
    Ok(LyricsData::from_row(track_id, row))
}

fn save_text(lib: &Library, track_id: &str, text: &str, source: &str) -> Result<(), String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("Текст пустой".into());
    }
    let lines = lrc::parse(text);
    if lines.is_empty() {
        lib.with_db(|c| db::save(c, track_id, None, Some(text), source, "found", None))
    } else {
        let plain = lrc::to_plain(&lines);
        lib.with_db(|c| db::save(c, track_id, Some(text), Some(&plain), source, "found", None))
    }
}

/// Сообщить интерфейсу, что текст трека изменился, и вернуть новый текст.
fn notify(app: &AppHandle, lib: &Library, track_id: &str) -> Result<LyricsData, String> {
    let data = load(lib, track_id)?;
    let _ = app.emit(events::CHANGED, Changed { track_id: track_id.to_string(), status: data.status });
    Ok(data)
}

async fn blocking<T, F>(app: AppHandle, f: F) -> Result<T, String>
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
