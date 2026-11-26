//! Тексты песен.
//!
//! Файлы модуля:
//!   lrc.rs      — разбор формата LRC (с тестами)
//!   lrclib.rs   — запросы к lrclib.net и выбор лучшего совпадения
//!   db.rs       — таблица lyrics в базе библиотеки
//!   service.rs  — фоновая очередь автопоиска (по одному треку, с прогрессом)
//!   commands.rs — команды Tauri
//!
//! В интернет ходит только lrclib.rs, и отправляет туда лишь название,
//! исполнителя, альбом и длительность песни.

pub mod commands;
mod db;
pub mod lrc;
mod lrclib;
pub mod service;

use serde::Serialize;

pub use service::LyricsService;

pub mod events {
    /// У трека изменился текст: { trackId, status }
    pub const CHANGED: &str = "lyrics-changed";
    /// Прогресс фонового поиска: { done, total, found, current, running }
    pub const PROGRESS: &str = "lyrics-progress";
}

/// Текст песни для интерфейса.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsData {
    pub track_id: String,
    /// synced | plain | instrumental | notFound | cleared | none
    pub status: &'static str,
    /// Откуда текст: lrclib | file | manual | edited
    pub source: Option<String>,
    /// Строки с временем (пусто, если текста с метками нет)
    pub lines: Vec<lrc::Line>,
    /// Текст без времени
    pub plain: Option<String>,
    /// Исходный LRC — для редактирования
    pub raw: Option<String>,
    /// Ручной сдвиг синхронизации, мс: + текст позже, − раньше
    pub offset_ms: i64,
    pub has_words: bool,
}

impl LyricsData {
    fn from_row(track_id: &str, row: Option<db::LyricsRow>) -> Self {
        let Some(row) = row else {
            return Self::empty(track_id, "none");
        };
        let lines = row.synced.as_deref().map(lrc::parse).unwrap_or_default();
        let status = match row.status.as_str() {
            "found" if !lines.is_empty() => "synced",
            "found" if row.plain.is_some() => "plain",
            "instrumental" => "instrumental",
            "not_found" => "notFound",
            "cleared" => "cleared",
            _ => "none",
        };
        Self {
            track_id: track_id.to_string(),
            status,
            source: Some(row.source),
            has_words: lines.iter().any(|l| !l.words.is_empty()),
            plain: row.plain.or_else(|| (!lines.is_empty()).then(|| lrc::to_plain(&lines))),
            raw: row.synced,
            lines,
            offset_ms: row.offset_ms,
        }
    }

    fn empty(track_id: &str, status: &'static str) -> Self {
        Self {
            track_id: track_id.to_string(),
            status,
            source: None,
            lines: Vec::new(),
            plain: None,
            raw: None,
            offset_ms: 0,
            has_words: false,
        }
    }
}

/// Текстовый файл → строка. Понимает UTF-8 (с BOM и без), UTF-16 и старую
/// русскую кодировку Windows-1251, в которой часто сохранены .lrc из интернета.
pub fn decode_text(bytes: &[u8]) -> String {
    if let Some(rest) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(rest).into_owned();
    }
    let utf16 = |rest: &[u8], le: bool| {
        let units: Vec<u16> = rest
            .chunks_exact(2)
            .map(|c| if le { u16::from_le_bytes([c[0], c[1]]) } else { u16::from_be_bytes([c[0], c[1]]) })
            .collect();
        String::from_utf16_lossy(&units)
    };
    if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        return utf16(rest, true);
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        return utf16(rest, false);
    }
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => bytes.iter().map(|&b| cp1251_char(b)).collect(),
    }
}

/// Байт Windows-1251 → символ.
fn cp1251_char(b: u8) -> char {
    const HIGH: &str = "ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—\u{98}™љ›њќћџ\u{a0}ЎўЈ¤Ґ¦§Ё©Є«¬\u{ad}®Ї°±Ііґµ¶·ё№є»јЅѕї";
    match b {
        0x00..=0x7F => b as char,
        0x80..=0xBF => HIGH.chars().nth((b - 0x80) as usize).unwrap_or('?'),
        _ => char::from_u32(0x410 + (b - 0xC0) as u32).unwrap_or('?'), // А..я
    }
}

#[cfg(test)]
mod tests {
    use super::decode_text;

    #[test]
    fn decodes_utf8_and_cp1251() {
        assert_eq!(decode_text("[00:01.00]Привет".as_bytes()), "[00:01.00]Привет");
        assert_eq!(decode_text(&[0xEF, 0xBB, 0xBF, b'a']), "a");
        // «Привет» в Windows-1251
        assert_eq!(decode_text(&[0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2]), "Привет");
        assert_eq!(decode_text(&[0xA8, 0xB8, 0xB9]), "Ёё№");
    }
}
