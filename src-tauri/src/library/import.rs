//! Импорт: файлы и папки → записи в базе + обложки. Сообщает прогресс во фронтенд.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use super::{covers, db, events, identify, tags, Library, AUDIO_EXTENSIONS};

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    /// Сколько аудиофайлов найдено
    pub total: usize,
    /// Новые треки
    pub added: usize,
    /// Уже были в библиотеке, но файл переехал/переименован — путь обновлён
    pub relinked: usize,
    /// Уже есть в библиотеке
    pub skipped: usize,
    pub errors: Vec<ImportError>,
    /// id новых треков — для них сразу запускается поиск текста (во фронтенд не отправляем)
    #[serde(skip)]
    pub added_ids: Vec<String>,
}

#[derive(Serialize)]
pub struct ImportError {
    pub path: String,
    pub message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    done: usize,
    total: usize,
    current: String,
}

enum Outcome {
    Added(String),
    Relinked,
    Skipped,
}

pub fn run(app: &AppHandle, lib: &Library, inputs: Vec<PathBuf>) -> Result<ImportSummary, String> {
    if lib.importing.swap(true, Ordering::SeqCst) {
        return Err("Импорт уже идёт — дождитесь окончания".into());
    }
    // Флаг сбросится, даже если функция выйдет с ошибкой
    let _guard = ResetOnDrop(&lib.importing);

    let files = collect_audio_files(&inputs);
    let mut summary = ImportSummary {
        total: files.len(),
        ..Default::default()
    };
    // Одно время на всю пачку: в «Моей музыке» новые пачки сверху,
    // а внутри пачки треки идут в порядке файлов (01, 02, 03…)
    let added_at = now_ms();

    let mut last_emit = Instant::now() - Duration::from_secs(1);
    for (i, path) in files.iter().enumerate() {
        match import_one(lib, path, added_at) {
            Ok(Outcome::Added(id)) => {
                summary.added += 1;
                summary.added_ids.push(id);
            }
            Ok(Outcome::Relinked) => summary.relinked += 1,
            Ok(Outcome::Skipped) => summary.skipped += 1,
            Err(message) => summary.errors.push(ImportError {
                path: path.display().to_string(),
                message,
            }),
        }
        // Не чаще 10 раз в секунду — иначе тысячи событий завалят интерфейс
        if last_emit.elapsed() >= Duration::from_millis(100) || i + 1 == files.len() {
            last_emit = Instant::now();
            let _ = app.emit(
                events::IMPORT_PROGRESS,
                Progress {
                    done: i + 1,
                    total: files.len(),
                    current: path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default(),
                },
            );
        }
    }

    if summary.added + summary.relinked > 0 {
        let _ = app.emit(events::CHANGED, ());
    }
    Ok(summary)
}

fn import_one(lib: &Library, path: &Path, added_at: i64) -> Result<Outcome, String> {
    let id = identify::track_id(path).map_err(|e| format!("не удалось прочитать файл: {e}"))?;
    let path_str = path.display().to_string();

    if let Some(known_path) = lib.with_db(|c| db::path_of(c, &id))? {
        if known_path == path_str || Path::new(&known_path).exists() {
            // Тот же файл (или его копия, а оригинал на месте) — уже в библиотеке
            return Ok(Outcome::Skipped);
        }
        // Файл переименовали или перенесли — обновляем путь, настройки сохраняются
        lib.with_db(|c| db::update_path(c, &id, &path_str))?;
        return Ok(Outcome::Relinked);
    }

    let meta = tags::read(path);
    let has_cover = match meta.cover.or_else(|| covers::find_in_folder(path)) {
        Some(bytes) => covers::save(&bytes, &lib.cover_path(&id), &lib.cover_small_path(&id)).is_ok(),
        None => false,
    };

    let row = db::NewTrack {
        id,
        path: path_str,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        track_no: meta.track_no,
        duration_ms: meta.duration_ms,
        has_cover,
        added_at,
    };
    lib.with_db(|c| db::insert(c, &row))?;
    Ok(Outcome::Added(row.id))
}

/// Разворачивает папки (со всеми подпапками) в список аудиофайлов.
fn collect_audio_files(inputs: &[PathBuf]) -> Vec<PathBuf> {
    // BTreeSet: без повторов и в алфавитном порядке (так треки альбома идут по номерам)
    let mut files = BTreeSet::new();
    for input in inputs {
        for entry in WalkDir::new(input).follow_links(true).into_iter().flatten() {
            let path = entry.path();
            if entry.file_type().is_file() && is_audio(path) {
                files.insert(path.to_path_buf());
            }
        }
    }
    files.into_iter().collect()
}

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| AUDIO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

struct ResetOnDrop<'a>(&'a AtomicBool);

impl Drop for ResetOnDrop<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
