//! База данных SQLite: схема и запросы.
//!
//! Версия схемы хранится в `PRAGMA user_version`. Каждый этап, которому нужны
//! новые таблицы, добавляет шаг `if version < N { ... }` — данные пользователя
//! при обновлении программы сохраняются.
//!   версия 1 (этап 3) — таблица tracks
//!   версия 2 (этап 4) — таблица appearance (своя обложка, фон, затемнение, размытие)
//!   версия 3 (этап 5) — таблица lyrics (тексты) + исходные теги в tracks (tag_title…),
//!                       чтобы изменённые название/исполнителя можно было вернуть
//!   версия 4 (этап 6) — плейлисты (playlists, playlist_tracks) и история прослушиваний

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension, Row};

use super::appearance::ImageKind;

/// Новый трек при импорте.
pub struct NewTrack {
    pub id: String,
    pub path: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub track_no: Option<u32>,
    pub duration_ms: Option<u64>,
    pub has_cover: bool,
    pub added_at: i64,
}

/// Трек из базы вместе с его оформлением.
pub struct TrackRow {
    pub id: String,
    pub path: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub track_no: Option<u32>,
    pub duration_ms: Option<u64>,
    /// Обложка из самого аудиофайла (или из папки альбома)
    pub has_cover: bool,
    pub added_at: i64,
    /// Имена файлов своих картинок в папке images (без расширения)
    pub cover_file: Option<String>,
    pub bg_file: Option<String>,
    pub dim: Option<f64>,
    pub blur: Option<f64>,
    /// Значения из тегов файла (до правок пользователя)
    pub tag_title: Option<String>,
    pub tag_artist: Option<String>,
    pub tag_album: Option<String>,
    /// Состояние текста: found / instrumental / not_found / cleared, None — не искали
    pub lyrics_status: Option<String>,
    pub lyrics_synced: bool,
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    // WAL + NORMAL: запись без ожидания диска после каждой строки —
    // импорт тысячи треков занимает секунды, а не минуты
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

    if version < 1 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS tracks (
                id          TEXT PRIMARY KEY,   -- хеш содержимого файла
                path        TEXT NOT NULL,
                title       TEXT NOT NULL,
                artist      TEXT,
                album       TEXT,
                track_no    INTEGER,
                duration_ms INTEGER,
                has_cover   INTEGER NOT NULL DEFAULT 0,
                added_at    INTEGER NOT NULL
            );
            PRAGMA user_version = 1;",
        )?;
    }

    if version < 2 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS appearance (
                track_id   TEXT PRIMARY KEY,   -- id трека из tracks
                cover_file TEXT,               -- своя обложка (файл в images/)
                bg_file    TEXT,               -- свой фон (файл в images/)
                dim        REAL,               -- затемнение 0..1, NULL = по умолчанию
                blur       REAL                -- размытие 0..60 px, NULL = по умолчанию
            );
            PRAGMA user_version = 2;",
        )?;
    }

    if version < 3 {
        // BEGIN…COMMIT: либо применится всё, либо ничего (база не останется «наполовину»)
        conn.execute_batch(
            "BEGIN;
            CREATE TABLE IF NOT EXISTS lyrics (
                track_id   TEXT PRIMARY KEY,
                synced     TEXT,               -- LRC с метками времени
                plain      TEXT,               -- текст без времени
                source     TEXT NOT NULL,      -- lrclib | file | manual | edited
                status     TEXT NOT NULL,      -- found | instrumental | not_found | cleared
                lrclib_id  INTEGER,
                offset_ms  INTEGER NOT NULL DEFAULT 0,  -- ручной сдвиг: + позже, − раньше
                updated_at INTEGER NOT NULL
            );
            ALTER TABLE tracks ADD COLUMN tag_title TEXT;
            ALTER TABLE tracks ADD COLUMN tag_artist TEXT;
            ALTER TABLE tracks ADD COLUMN tag_album TEXT;
            UPDATE tracks SET tag_title = title, tag_artist = artist, tag_album = album;
            PRAGMA user_version = 3;
            COMMIT;",
        )?;
    }

    if version < 4 {
        conn.execute_batch(
            "BEGIN;
            CREATE TABLE IF NOT EXISTS playlists (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id INTEGER NOT NULL,
                track_id    TEXT NOT NULL,
                position    INTEGER NOT NULL,   -- порядок песни в плейлисте
                added_at    INTEGER NOT NULL,
                PRIMARY KEY (playlist_id, track_id)
            );
            CREATE TABLE IF NOT EXISTS play_history (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id  TEXT NOT NULL,
                played_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS play_history_time ON play_history (played_at);
            PRAGMA user_version = 4;
            COMMIT;",
        )?;
    }
    Ok(())
}

// ---------- Треки ----------

const SELECT_TRACKS: &str = "
    SELECT t.id, t.path, t.title, t.artist, t.album, t.track_no, t.duration_ms,
           t.has_cover, t.added_at, a.cover_file, a.bg_file, a.dim, a.blur,
           t.tag_title, t.tag_artist, t.tag_album, l.status, l.synced IS NOT NULL
    FROM tracks t
    LEFT JOIN appearance a ON a.track_id = t.id
    LEFT JOIN lyrics l ON l.track_id = t.id";

fn read_row(row: &Row) -> rusqlite::Result<TrackRow> {
    Ok(TrackRow {
        id: row.get(0)?,
        path: row.get(1)?,
        title: row.get(2)?,
        artist: row.get(3)?,
        album: row.get(4)?,
        track_no: row.get(5)?,
        duration_ms: row.get::<_, Option<i64>>(6)?.map(|d| d as u64),
        has_cover: row.get(7)?,
        added_at: row.get(8)?,
        cover_file: row.get(9)?,
        bg_file: row.get(10)?,
        dim: row.get(11)?,
        blur: row.get(12)?,
        tag_title: row.get(13)?,
        tag_artist: row.get(14)?,
        tag_album: row.get(15)?,
        lyrics_status: row.get(16)?,
        lyrics_synced: row.get(17)?,
    })
}

/// Все треки: новые пачки сверху, внутри пачки — в порядке добавления.
pub fn list(conn: &Connection) -> rusqlite::Result<Vec<TrackRow>> {
    let mut stmt = conn.prepare(&format!("{SELECT_TRACKS} ORDER BY t.added_at DESC, t.rowid ASC"))?;
    let rows = stmt.query_map([], read_row)?;
    rows.collect()
}

pub fn get(conn: &Connection, id: &str) -> rusqlite::Result<Option<TrackRow>> {
    conn.query_row(&format!("{SELECT_TRACKS} WHERE t.id = ?1"), params![id], read_row)
        .optional()
}

/// Путь трека по id (None — такого трека в базе нет).
pub fn path_of(conn: &Connection, id: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT path FROM tracks WHERE id = ?1", params![id], |row| row.get(0))
        .optional()
}

pub fn update_path(conn: &Connection, id: &str, path: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE tracks SET path = ?2 WHERE id = ?1", params![id, path])?;
    Ok(())
}

pub fn insert(conn: &Connection, t: &NewTrack) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO tracks (id, path, title, artist, album, track_no, duration_ms, has_cover, added_at,
                             tag_title, tag_artist, tag_album)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?3, ?4, ?5)",
        params![
            t.id,
            t.path,
            t.title,
            t.artist,
            t.album,
            t.track_no,
            t.duration_ms.map(|d| d as i64),
            t.has_cover,
            t.added_at
        ],
    )?;
    Ok(())
}

/// Удаляет треки вместе с оформлением, текстами, местами в плейлистах и историей.
pub fn delete(conn: &Connection, ids: &[String]) -> rusqlite::Result<()> {
    for sql in [
        "DELETE FROM tracks WHERE id = ?1",
        "DELETE FROM appearance WHERE track_id = ?1",
        "DELETE FROM lyrics WHERE track_id = ?1",
        "DELETE FROM playlist_tracks WHERE track_id = ?1",
        "DELETE FROM play_history WHERE track_id = ?1",
    ] {
        let mut stmt = conn.prepare(sql)?;
        for id in ids {
            stmt.execute(params![id])?;
        }
    }
    Ok(())
}

/// Изменить название / исполнителя / альбом (только в библиотеке, файл не трогаем).
pub fn update_info(
    conn: &Connection,
    id: &str,
    title: &str,
    artist: Option<&str>,
    album: Option<&str>,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE tracks SET title = ?2, artist = ?3, album = ?4 WHERE id = ?1",
        params![id, title, artist, album],
    )?;
    Ok(())
}

/// Вернуть название / исполнителя / альбом из тегов файла.
pub fn reset_info(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE tracks SET title = COALESCE(tag_title, title), artist = tag_artist, album = tag_album
         WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

// ---------- Оформление ----------

/// Запомнить (или убрать, если None) свою картинку трека.
/// `INSERT ... ON CONFLICT DO UPDATE` — «вставить, а если строка уже есть — обновить».
pub fn set_image_file(
    conn: &Connection,
    id: &str,
    kind: ImageKind,
    file: Option<&str>,
) -> rusqlite::Result<()> {
    // Имя колонки берётся из нашего же enum, а не от пользователя — подставлять безопасно
    let column = kind.column();
    conn.execute(
        &format!(
            "INSERT INTO appearance (track_id, {column}) VALUES (?1, ?2)
             ON CONFLICT(track_id) DO UPDATE SET {column} = excluded.{column}"
        ),
        params![id, file],
    )?;
    Ok(())
}

pub fn set_params(conn: &Connection, id: &str, dim: f64, blur: f64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO appearance (track_id, dim, blur) VALUES (?1, ?2, ?3)
         ON CONFLICT(track_id) DO UPDATE SET dim = excluded.dim, blur = excluded.blur",
        params![id, dim, blur],
    )?;
    Ok(())
}
