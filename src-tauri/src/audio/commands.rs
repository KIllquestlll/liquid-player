//! Команды Tauri для плеера. Фронтенд вызывает их через invoke("player_...").
//!
//! Простые команды (play/pause/seek/volume) только кладут сообщение в канал
//! и сразу возвращаются — интерфейс не ждёт звук.
//! Команды с ответом (load, get_state) ждут ответ аудиопотока в отдельном
//! «блокирующем» потоке, чтобы не тормозить остальные запросы.

use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

use tauri::State;

use super::{AudioHandle, Command, PlayerState, TrackInfo};

#[tauri::command]
pub async fn player_load(
    audio: State<'_, AudioHandle>,
    path: String,
    autoplay: Option<bool>,
) -> Result<TrackInfo, String> {
    let path = PathBuf::from(path);
    let autoplay = autoplay.unwrap_or(true);
    request(&audio, |reply| Command::Load { path, autoplay, reply }).await?
}

#[tauri::command]
pub async fn player_get_state(audio: State<'_, AudioHandle>) -> Result<PlayerState, String> {
    request(&audio, Command::GetState).await
}

#[tauri::command]
pub fn player_play(audio: State<AudioHandle>) -> Result<(), String> {
    audio.send(Command::Play)
}

#[tauri::command]
pub fn player_pause(audio: State<AudioHandle>) -> Result<(), String> {
    audio.send(Command::Pause)
}

#[tauri::command]
pub fn player_toggle(audio: State<AudioHandle>) -> Result<(), String> {
    audio.send(Command::Toggle)
}

/// В JS аргумент называется positionMs — Tauri сам переводит camelCase → snake_case.
#[tauri::command]
pub fn player_seek(audio: State<AudioHandle>, position_ms: u64) -> Result<(), String> {
    audio.send(Command::Seek(Duration::from_millis(position_ms)))
}

#[tauri::command]
pub fn player_set_volume(audio: State<AudioHandle>, volume: f32) -> Result<(), String> {
    audio.send(Command::SetVolume(volume))
}

/// Отправить команду с «обратным адресом» (reply) и дождаться ответа.
async fn request<T: Send + 'static>(
    audio: &AudioHandle,
    make_command: impl FnOnce(mpsc::Sender<T>) -> Command,
) -> Result<T, String> {
    let (reply, answer) = mpsc::channel();
    audio.send(make_command(reply))?;
    tauri::async_runtime::spawn_blocking(move || answer.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "аудиопоток не ответил".to_string())
}
