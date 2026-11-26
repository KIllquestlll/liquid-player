//! Аудиодвижок.
//!
//! Как это устроено:
//!   * Отдельный поток «audio» владеет звуковым устройством и плеером rodio.
//!   * Остальное приложение общается с ним только сообщениями `Command`
//!     через канал (mpsc). Никаких общих переменных и блокировок.
//!   * Пока трек играет, поток каждые 50 мс шлёт во фронтенд событие
//!     `player-progress` с позицией. При любом изменении — `player-state`.
//!
//! Файлы модуля:
//!   decode.rs   — открыть файл и создать потоковый декодер
//!   engine.rs   — сам поток и логика плеера
//!   commands.rs — команды Tauri, которые вызывает фронтенд

pub mod commands;
mod decode;
mod engine;

use std::path::PathBuf;
use std::sync::mpsc::Sender;
use std::time::Duration;

use serde::Serialize;

pub use engine::spawn;

/// Имена событий, которые Rust отправляет во фронтенд.
pub mod events {
    pub const STATE: &str = "player-state";
    pub const PROGRESS: &str = "player-progress";
    pub const ENDED: &str = "player-ended";
    pub const ERROR: &str = "player-error";
}

/// Сообщения, которые можно отправить аудиопотоку.
pub enum Command {
    /// Загрузить файл. Ответ (успех или текст ошибки) придёт в `reply`.
    Load {
        path: PathBuf,
        autoplay: bool,
        reply: Sender<Result<TrackInfo, String>>,
    },
    Play,
    Pause,
    Toggle,
    Seek(Duration),
    /// Положение ползунка громкости 0.0..=1.0
    SetVolume(f32),
    GetState(Sender<PlayerState>),
}

/// Что фронтенд получает после загрузки трека.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackInfo {
    pub path: String,
    /// None — длительность неизвестна (перемотка тогда недоступна)
    pub duration_ms: Option<u64>,
}

/// Полный снимок состояния плеера (событие `player-state`).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerState {
    pub path: Option<String>,
    pub duration_ms: Option<u64>,
    pub position_ms: u64,
    pub playing: bool,
}

/// Позиция воспроизведения (событие `player-progress`, ~20 раз в секунду).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub position_ms: u64,
}

/// «Пульт» от аудиопотока. Хранится в состоянии Tauri (app.manage),
/// поэтому доступен в любой команде через `State<AudioHandle>`.
pub struct AudioHandle {
    tx: Sender<Command>,
}

impl AudioHandle {
    pub fn send(&self, cmd: Command) -> Result<(), String> {
        self.tx
            .send(cmd)
            .map_err(|_| "аудиопоток остановлен".to_string())
    }
}
