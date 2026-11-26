//! Клиент lrclib.net — бесплатной открытой базы синхронизированных текстов.
//! Документация API: https://lrclib.net/docs
//!
//!   GET /api/get?track_name=&artist_name=&album_name=&duration=  — точное совпадение (404 — нет)
//!   GET /api/search?track_name=&artist_name=                      — список кандидатов
//!   GET /api/get/{id}                                             — запись по номеру

use std::time::Duration;

use serde::{Deserialize, Serialize};

const API: &str = "https://lrclib.net/api";

/// Запись lrclib (лишние поля ответа игнорируются).
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub id: i64,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: Option<String>,
    /// Длительность в секундах (дробное число)
    pub duration: Option<f64>,
    #[serde(default)]
    pub instrumental: bool,
    pub plain_lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
}

impl Record {
    pub fn synced(&self) -> Option<&str> {
        self.synced_lyrics.as_deref().filter(|s| !s.trim().is_empty())
    }

    pub fn plain(&self) -> Option<&str> {
        self.plain_lyrics.as_deref().filter(|s| !s.trim().is_empty())
    }

    fn usable(&self) -> bool {
        self.instrumental || self.synced().is_some() || self.plain().is_some()
    }

    fn duration_ms(&self) -> Option<u64> {
        self.duration.map(|d| (d * 1000.0) as u64)
    }
}

/// Кандидат для ручного выбора в Админ-панели.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub id: i64,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: Option<String>,
    pub duration_ms: Option<u64>,
    pub synced: bool,
    pub plain: bool,
    pub instrumental: bool,
    /// Первые строки текста — чтобы сразу видеть, та ли это песня
    pub preview: String,
}

impl From<&Record> for Candidate {
    fn from(r: &Record) -> Self {
        let preview = r
            .plain()
            .map(|p| p.lines().filter(|l| !l.trim().is_empty()).take(2).collect::<Vec<_>>().join(" / "))
            .unwrap_or_default();
        Self {
            id: r.id,
            track_name: r.track_name.clone(),
            artist_name: r.artist_name.clone(),
            album_name: r.album_name.clone(),
            duration_ms: r.duration_ms(),
            synced: r.synced().is_some(),
            plain: r.plain().is_some(),
            instrumental: r.instrumental,
            preview,
        }
    }
}

pub struct Client {
    http: reqwest::Client,
}

impl Client {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            // lrclib просит, чтобы программы представлялись своим именем
            .user_agent(concat!("LiquidPlayer/", env!("CARGO_PKG_VERSION"), " (desktop music player)"))
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(20))
            .build()
            .expect("не удалось создать HTTP-клиент");
        Self { http }
    }

    async fn get_json<T: for<'de> Deserialize<'de>>(&self, url: &str, query: &[(&str, String)]) -> Result<Option<T>, String> {
        let response = self
            .http
            .get(url)
            .query(query)
            .send()
            .await
            .map_err(|e| format!("Нет связи с lrclib.net: {e}"))?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !response.status().is_success() {
            return Err(format!("lrclib.net ответил ошибкой {}", response.status()));
        }
        response
            .json::<T>()
            .await
            .map(Some)
            .map_err(|e| format!("Непонятный ответ lrclib.net: {e}"))
    }

    pub async fn get_by_id(&self, id: i64) -> Result<Record, String> {
        self.get_json(&format!("{API}/get/{id}"), &[])
            .await?
            .ok_or_else(|| "Такого текста на lrclib.net больше нет".to_string())
    }

    /// Точное совпадение по всем четырём полям (lrclib допускает разницу длительности ±2 с).
    pub async fn get_exact(&self, title: &str, artist: &str, album: &str, duration_s: u64) -> Result<Option<Record>, String> {
        self.get_json(
            &format!("{API}/get"),
            &[
                ("track_name", title.to_string()),
                ("artist_name", artist.to_string()),
                ("album_name", album.to_string()),
                ("duration", duration_s.to_string()),
            ],
        )
        .await
    }

    /// Поиск кандидатов. Без исполнителя — по общей строке запроса.
    pub async fn search(&self, title: &str, artist: Option<&str>) -> Result<Vec<Record>, String> {
        let query: Vec<(&str, String)> = match artist {
            Some(artist) => vec![("track_name", title.to_string()), ("artist_name", artist.to_string())],
            None => vec![("q", title.to_string())],
        };
        Ok(self.get_json(&format!("{API}/search"), &query).await?.unwrap_or_default())
    }
}

/// Автопоиск: сначала точный запрос, потом поиск и выбор лучшего кандидата.
pub async fn find_best(
    client: &Client,
    title: &str,
    artist: Option<&str>,
    album: Option<&str>,
    duration_ms: Option<u64>,
) -> Result<Option<Record>, String> {
    if let (Some(artist), Some(album), Some(ms)) = (artist, album, duration_ms) {
        if let Some(record) = client.get_exact(title, artist, album, (ms + 500) / 1000).await? {
            if record.usable() {
                return Ok(Some(record));
            }
        }
    }
    let mut results = client.search(title, artist).await?;
    // Ничего не нашли по полям — пробуем общей строкой «исполнитель название»
    if results.is_empty() {
        if let Some(artist) = artist {
            results = client.search(&format!("{artist} {title}"), None).await?;
        }
    }
    Ok(pick_best(results, title, artist.is_some(), duration_ms))
}

/// Лучший кандидат: длительность отличается не больше чем на 3 с,
/// синхронизированный текст лучше обычного, ближе по длительности — лучше.
fn pick_best(results: Vec<Record>, title: &str, artist_known: bool, duration_ms: Option<u64>) -> Option<Record> {
    let wanted = normalize(title);
    results
        .into_iter()
        .filter(|r| r.usable())
        .filter(|r| match (duration_ms, r.duration_ms()) {
            (Some(ours), Some(theirs)) => ours.abs_diff(theirs) <= 3000,
            _ => true,
        })
        // без исполнителя поиск «размытый» — требуем совпадения названия
        .filter(|r| artist_known || normalize(&r.track_name) == wanted)
        .min_by_key(|r| {
            let diff = match (duration_ms, r.duration_ms()) {
                (Some(ours), Some(theirs)) => ours.abs_diff(theirs),
                _ => 0,
            };
            (r.synced().is_none(), diff)
        })
}

fn normalize(s: &str) -> String {
    s.trim().to_lowercase().replace('ё', "е")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(id: i64, name: &str, duration: f64, synced: bool) -> Record {
        Record {
            id,
            track_name: name.into(),
            artist_name: "A".into(),
            album_name: None,
            duration: Some(duration),
            instrumental: false,
            plain_lyrics: Some("текст".into()),
            synced_lyrics: synced.then(|| "[00:01.00]текст".into()),
        }
    }

    #[test]
    fn prefers_synced_within_duration() {
        let results = vec![rec(1, "Песня", 200.0, false), rec(2, "Песня", 201.5, true), rec(3, "Песня", 260.0, true)];
        assert_eq!(pick_best(results, "Песня", true, Some(200_000)).map(|r| r.id), Some(2));
    }

    #[test]
    fn rejects_wrong_duration_and_title() {
        let results = vec![rec(1, "Песня", 260.0, true)];
        assert!(pick_best(results, "Песня", true, Some(200_000)).is_none());
        let results = vec![rec(1, "Другая", 200.0, true)];
        assert!(pick_best(results, "Песня", false, Some(200_000)).is_none());
    }
}
