//! Фоновый автопоиск текстов: очередь треков, обрабатывается по одному.
//!
//! Очередь пополняется после импорта новых песен и кнопкой «Найти недостающие
//! тексты». Пока она работает, интерфейс получает событие lyrics-progress,
//! а после каждого трека — lyrics-changed.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use super::{db, events, lrclib};
use crate::library::Library;

pub struct LyricsService {
    pub(super) client: lrclib::Client,
    queue: Mutex<VecDeque<String>>,
    running: AtomicBool,
    cancel: AtomicBool,
    stats: Mutex<Stats>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Stats {
    done: usize,
    total: usize,
    found: usize,
    current: String,
    running: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Changed {
    pub track_id: String,
    pub status: &'static str,
}

impl LyricsService {
    pub fn new() -> Self {
        Self {
            client: lrclib::Client::new(),
            queue: Mutex::new(VecDeque::new()),
            running: AtomicBool::new(false),
            cancel: AtomicBool::new(false),
            stats: Mutex::new(Stats::default()),
        }
    }
}

/// Поставить треки в очередь автопоиска.
pub fn enqueue(app: &AppHandle, ids: Vec<String>) {
    if ids.is_empty() {
        return;
    }
    let svc = app.state::<LyricsService>();
    {
        let mut queue = svc.queue.lock().unwrap();
        let mut stats = svc.stats.lock().unwrap();
        for id in ids {
            if !queue.contains(&id) {
                queue.push_back(id);
                stats.total += 1;
            }
        }
    }
    svc.cancel.store(false, Ordering::SeqCst);
    // Запускаем обработчик, только если он ещё не работает
    if !svc.running.swap(true, Ordering::SeqCst) {
        let app = app.clone();
        tauri::async_runtime::spawn(async move { worker(app).await });
    }
}

/// Остановить фоновый поиск (текущий трек дорабатывается).
pub fn cancel(app: &AppHandle) {
    let svc = app.state::<LyricsService>();
    svc.cancel.store(true, Ordering::SeqCst);
    svc.queue.lock().unwrap().clear();
}

async fn worker(app: AppHandle) {
    let svc = app.state::<LyricsService>();
    loop {
        let next = svc.queue.lock().unwrap().pop_front();
        let Some(track_id) = next else {
            // Очередь пуста. Выключаемся, но ещё раз проверяем: вдруг кто-то успел добавить
            svc.running.store(false, Ordering::SeqCst);
            if svc.queue.lock().unwrap().is_empty() || svc.running.swap(true, Ordering::SeqCst) {
                break;
            }
            continue;
        };
        if svc.cancel.load(Ordering::SeqCst) {
            continue;
        }

        let title = app
            .state::<Library>()
            .get(&track_id)
            .map(|t| t.title)
            .unwrap_or_default();
        emit_progress(&app, |s| s.current = title.clone());

        let result = fetch_one(&app, &track_id).await;
        let found = matches!(result, Ok("synced" | "plain" | "instrumental"));
        if let Ok(status) = result {
            let _ = app.emit(events::CHANGED, Changed { track_id: track_id.clone(), status });
        }
        emit_progress(&app, |s| {
            s.done += 1;
            if found {
                s.found += 1;
            }
        });
        // Не нагружаем бесплатный сервис: небольшая пауза между запросами
        tokio_sleep(Duration::from_millis(150)).await;
    }

    // Всё обработано — сообщаем итог и обнуляем счётчики
    emit_progress(&app, |s| {
        s.running = false;
        s.current.clear();
    });
    *svc.stats.lock().unwrap() = Stats::default();
}

fn emit_progress(app: &AppHandle, update: impl FnOnce(&mut Stats)) {
    let svc = app.state::<LyricsService>();
    let snapshot = {
        let mut stats = svc.stats.lock().unwrap();
        stats.running = true;
        update(&mut stats);
        stats.clone()
    };
    let _ = app.emit(events::PROGRESS, snapshot);
}

/// Найти текст для одного трека и сохранить. Возвращает новый статус.
/// Уже найденные / вручную очищенные тексты не трогает.
pub async fn fetch_one(app: &AppHandle, track_id: &str) -> Result<&'static str, String> {
    let lib = app.state::<Library>();
    let track = lib.get(track_id)?;
    if matches!(track.lyrics, "synced" | "plain" | "instrumental" | "cleared") {
        return Ok(track.lyrics);
    }

    let svc = app.state::<LyricsService>();
    let record = lrclib::find_best(
        &svc.client,
        &track.title,
        track.artist.as_deref(),
        track.album.as_deref(),
        track.duration_ms,
    )
    .await?;

    let status = match &record {
        Some(r) if r.synced().is_some() || r.plain().is_some() => {
            lib.with_db(|c| db::save(c, track_id, r.synced(), r.plain(), "lrclib", "found", Some(r.id)))?;
            if r.synced().is_some() {
                "synced"
            } else {
                "plain"
            }
        }
        Some(r) => {
            lib.with_db(|c| db::save(c, track_id, None, None, "lrclib", "instrumental", Some(r.id)))?;
            "instrumental"
        }
        None => {
            lib.with_db(|c| db::save(c, track_id, None, None, "lrclib", "not_found", None))?;
            "notFound"
        }
    };
    Ok(status)
}

async fn tokio_sleep(duration: Duration) {
    // async_runtime Tauri — это tokio; отдельная зависимость tokio не нужна
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(duration)).await;
}
