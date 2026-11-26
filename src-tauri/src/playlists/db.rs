//! Запросы к таблицам playlists, playlist_tracks и play_history.
//! Изменения из нескольких запросов делаются в транзакции: либо всё, либо ничего.

use rusqlite::{params, Connection, OptionalExtension};

use super::{now_ms, HistoryItem, Playlist};

/// Сколько записей истории хранить (старые удаляются сами).
const HISTORY_LIMIT: i64 = 3000;

pub fn list(conn: &Connection) -> rusqlite::Result<Vec<Playlist>> {
    let mut stmt = conn.prepare("SELECT id FROM playlists ORDER BY created_at DESC, id DESC")?;
    let ids: Vec<i64> = stmt.query_map([], |row| row.get(0))?.collect::<Result<_, _>>()?;
    let mut playlists = Vec::with_capacity(ids.len());
    for id in ids {
        if let Some(p) = get(conn, id)? {
            playlists.push(p);
        }
    }
    Ok(playlists)
}

pub fn get(conn: &Connection, id: i64) -> rusqlite::Result<Option<Playlist>> {
    let head = conn
        .query_row(
            "SELECT name, created_at, updated_at FROM playlists WHERE id = ?1",
            params![id],
            |row| Ok((row.get::<_, String>(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    let Some((name, created_at, updated_at)) = head else {
        return Ok(None);
    };
    let mut stmt = conn.prepare("SELECT track_id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position")?;
    let track_ids = stmt.query_map(params![id], |row| row.get(0))?.collect::<Result<_, _>>()?;
    Ok(Some(Playlist { id, name, track_ids, created_at, updated_at }))
}

pub fn create(conn: &Connection, name: &str, track_ids: &[String]) -> rusqlite::Result<i64> {
    let tx = conn.unchecked_transaction()?;
    let now = now_ms();
    tx.execute(
        "INSERT INTO playlists (name, created_at, updated_at) VALUES (?1, ?2, ?2)",
        params![name, now],
    )?;
    let id = tx.last_insert_rowid();
    append(&tx, id, track_ids)?;
    tx.commit()?;
    Ok(id)
}

pub fn rename(conn: &Connection, id: i64, name: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE playlists SET name = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, name, now_ms()],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM playlist_tracks WHERE playlist_id = ?1", params![id])?;
    tx.execute("DELETE FROM playlists WHERE id = ?1", params![id])?;
    tx.commit()
}

pub fn add_tracks(conn: &Connection, id: i64, track_ids: &[String]) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    append(&tx, id, track_ids)?;
    touch(&tx, id)?;
    tx.commit()
}

/// Добавить в конец. Песни, которые уже есть в плейлисте или которых нет в библиотеке, пропускаются.
fn append(conn: &Connection, id: i64, track_ids: &[String]) -> rusqlite::Result<()> {
    let mut next: i64 = conn.query_row(
        "SELECT COALESCE(MAX(position) + 1, 0) FROM playlist_tracks WHERE playlist_id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    let now = now_ms();
    let mut insert = conn.prepare(
        "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at)
         SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM tracks WHERE id = ?2)",
    )?;
    for track_id in track_ids {
        if insert.execute(params![id, track_id, next, now])? > 0 {
            next += 1;
        }
    }
    Ok(())
}

pub fn remove_tracks(conn: &Connection, id: i64, track_ids: &[String]) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = tx.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2")?;
        for track_id in track_ids {
            stmt.execute(params![id, track_id])?;
        }
    }
    touch(&tx, id)?;
    tx.commit()
}

/// Новый порядок песен: `track_ids` — все песни плейлиста в нужном порядке.
pub fn reorder(conn: &Connection, id: i64, track_ids: &[String]) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = tx.prepare("UPDATE playlist_tracks SET position = ?3 WHERE playlist_id = ?1 AND track_id = ?2")?;
        for (position, track_id) in track_ids.iter().enumerate() {
            stmt.execute(params![id, track_id, position as i64])?;
        }
    }
    touch(&tx, id)?;
    tx.commit()
}

fn touch(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("UPDATE playlists SET updated_at = ?2 WHERE id = ?1", params![id, now_ms()])?;
    Ok(())
}

// ---------- История ----------

pub fn history_add(conn: &Connection, track_id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO play_history (track_id, played_at) SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM tracks WHERE id = ?1)",
        params![track_id, now_ms()],
    )?;
    // Храним только последние HISTORY_LIMIT записей
    conn.execute(
        "DELETE FROM play_history WHERE id <= (SELECT MAX(id) FROM play_history) - ?1",
        params![HISTORY_LIMIT],
    )?;
    Ok(())
}

/// Песни, которые слушали, — каждая один раз, последние сверху.
pub fn history_recent(conn: &Connection, limit: i64) -> rusqlite::Result<Vec<HistoryItem>> {
    let mut stmt = conn.prepare(
        "SELECT track_id, MAX(played_at) AS last, COUNT(*) FROM play_history
         GROUP BY track_id ORDER BY last DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit], |row| {
        Ok(HistoryItem { track_id: row.get(0)?, last_played_at: row.get(1)?, plays: row.get(2)? })
    })?;
    rows.collect()
}

pub fn history_remove(conn: &Connection, track_id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM play_history WHERE track_id = ?1", params![track_id])?;
    Ok(())
}

pub fn history_clear(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM play_history", [])?;
    Ok(())
}
