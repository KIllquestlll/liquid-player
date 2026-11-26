//! Плейлисты и история прослушиваний (таблицы создаются миграцией 4 в library/db.rs).
//!
//!   db.rs       — запросы
//!   commands.rs — команды Tauri
//!
//! Плейлист хранит только id песен и их порядок — сами песни остаются в библиотеке.
//! Убрали песню из библиотеки — она пропадает и из всех плейлистов.

pub mod commands;
mod db;

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    /// Песни по порядку
    pub track_ids: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Песня в «Недавно прослушанном».
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub track_id: String,
    /// Когда слушали последний раз (мс с 1970 г.)
    pub last_played_at: i64,
    /// Сколько раз всего
    pub plays: i64,
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Название плейлиста: без лишних пробелов, не длиннее 100 символов.
fn clean_name(name: &str) -> Result<String, String> {
    let name: String = name.trim().chars().take(100).collect();
    if name.is_empty() {
        Err("Введите название плейлиста".into())
    } else {
        Ok(name)
    }
}
