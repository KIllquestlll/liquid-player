//! Таблица lyrics (создаётся миграцией версии 3 в library/db.rs).

use rusqlite::{params, Connection, OptionalExtension};

pub struct LyricsRow {
    pub synced: Option<String>,
    pub plain: Option<String>,
    pub source: String,
    pub status: String,
    pub offset_ms: i64,
}

pub fn get(conn: &Connection, track_id: &str) -> rusqlite::Result<Option<LyricsRow>> {
    conn.query_row(
        "SELECT synced, plain, source, status, offset_ms FROM lyrics WHERE track_id = ?1",
        params![track_id],
        |row| {
            Ok(LyricsRow {
                synced: row.get(0)?,
                plain: row.get(1)?,
                source: row.get(2)?,
                status: row.get(3)?,
                offset_ms: row.get(4)?,
            })
        },
    )
    .optional()
}

/// Сохранить текст. Ручной сдвиг (offset_ms) при замене текста сбрасывается.
pub fn save(
    conn: &Connection,
    track_id: &str,
    synced: Option<&str>,
    plain: Option<&str>,
    source: &str,
    status: &str,
    lrclib_id: Option<i64>,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO lyrics (track_id, synced, plain, source, status, lrclib_id, offset_ms, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)
         ON CONFLICT(track_id) DO UPDATE SET
            synced = excluded.synced, plain = excluded.plain, source = excluded.source,
            status = excluded.status, lrclib_id = excluded.lrclib_id, offset_ms = 0,
            updated_at = excluded.updated_at",
        params![track_id, synced, plain, source, status, lrclib_id, now_ms()],
    )?;
    Ok(())
}

pub fn set_offset(conn: &Connection, track_id: &str, offset_ms: i64) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE lyrics SET offset_ms = ?2 WHERE track_id = ?1",
        params![track_id, offset_ms],
    )?;
    Ok(())
}

/// Треки, для которых стоит искать текст: ещё не искали или в прошлый раз не нашли.
/// Тексты, удалённые пользователем вручную (cleared), не трогаем.
pub fn ids_without_lyrics(conn: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT t.id FROM tracks t LEFT JOIN lyrics l ON l.track_id = t.id
         WHERE l.track_id IS NULL OR l.status = 'not_found'
         ORDER BY t.added_at DESC, t.rowid ASC",
    )?;
    let rows = stmt.query_map([], |row| row.get(0))?;
    rows.collect()
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
