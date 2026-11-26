//! Аудиопоток: владеет звуковым устройством и плеером, выполняет команды,
//! шлёт во фронтенд позицию воспроизведения.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

use rodio::{DeviceSinkBuilder, MixerDeviceSink, Player};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::{decode, events, AudioHandle, Command, PlayerState, Progress, TrackInfo};

/// Как часто отправлять позицию во фронтенд.
const TICK: Duration = Duration::from_millis(50);
const DEFAULT_VOLUME: f32 = 0.8;

/// Запускает аудиопоток и возвращает «пульт» для отправки ему команд.
pub fn spawn(app: AppHandle) -> AudioHandle {
    let (tx, rx) = mpsc::channel();
    std::thread::Builder::new()
        .name("audio".into())
        .spawn(move || run(app, rx))
        .expect("не удалось запустить аудиопоток");
    AudioHandle { tx }
}

/// Главный цикл потока.
fn run(app: AppHandle, rx: Receiver<Command>) {
    // Звуковое устройство открываем внутри потока: объект устройства
    // нельзя безопасно передавать между потоками, и он должен жить, пока играет звук.
    let device = match DeviceSinkBuilder::open_default_sink() {
        Ok(mut device) => {
            device.log_on_drop(false);
            Some(device)
        }
        Err(e) => {
            eprintln!("[audio] нет устройства вывода: {e}");
            None
        }
    };

    let mut engine = Engine::new(app, device);
    // Время следующего тика считаем «по расписанию» (+50 мс к предыдущему),
    // а не от фактического момента: таймер Windows округляет ожидание
    // до ~15.6 мс, и без этой поправки тики шли бы раз в ~62 мс.
    let mut next_tick = Instant::now();

    loop {
        let message = if engine.is_playing() {
            // Играем: ждём команду, но не дольше, чем до следующего тика
            rx.recv_timeout(next_tick.saturating_duration_since(Instant::now()))
        } else {
            // Ничего не играет: спим до следующей команды, не тратя процессор
            rx.recv().map_err(|_| RecvTimeoutError::Disconnected)
        };

        match message {
            Ok(cmd) => engine.handle(cmd),
            Err(RecvTimeoutError::Timeout) => {}
            // Все «пульты» уничтожены — приложение закрывается
            Err(RecvTimeoutError::Disconnected) => break,
        }

        let now = Instant::now();
        if engine.is_playing() && now >= next_tick {
            engine.tick();
            next_tick += TICK;
            if next_tick <= now {
                // долго стояли на паузе — начинаем расписание заново
                next_tick = now + TICK;
            }
        }
    }
}

struct Engine {
    app: AppHandle,
    device: Option<MixerDeviceSink>,
    /// Плеер rodio текущего трека. На каждый трек создаётся новый:
    /// при замене старый уничтожается (drop) и его звук сразу останавливается.
    player: Option<Player>,
    path: Option<PathBuf>,
    duration: Option<Duration>,
    /// Положение ползунка громкости 0..=1
    volume: f32,
    /// true — в плеере есть недоигранный трек; false — трек доигран или не загружен
    loaded: bool,
}

impl Engine {
    fn new(app: AppHandle, device: Option<MixerDeviceSink>) -> Self {
        Self {
            app,
            device,
            player: None,
            path: None,
            duration: None,
            volume: DEFAULT_VOLUME,
            loaded: false,
        }
    }

    fn is_playing(&self) -> bool {
        self.loaded && self.player.as_ref().is_some_and(|p| !p.is_paused())
    }

    fn handle(&mut self, cmd: Command) {
        match cmd {
            Command::Load { path, autoplay, reply } => {
                let result = self.load(&path, autoplay);
                // Если фронтенд перестал ждать ответ — не страшно, игнорируем
                let _ = reply.send(result);
            }
            Command::Play => self.play(),
            Command::Pause => {
                if let Some(player) = &self.player {
                    player.pause();
                }
            }
            Command::Toggle => {
                if self.is_playing() {
                    self.handle(Command::Pause);
                    return;
                }
                self.play();
            }
            Command::Seek(position) => self.seek(position),
            Command::SetVolume(volume) => {
                self.volume = volume.clamp(0.0, 1.0);
                if let Some(player) = &self.player {
                    player.set_volume(gain(self.volume));
                }
                return; // громкость фронтенд и так знает — событие не нужно
            }
            Command::GetState(reply) => {
                let _ = reply.send(self.snapshot());
                return;
            }
        }
        self.emit(events::STATE, self.snapshot());
    }

    /// Открыть файл и поставить его в новый плеер.
    fn load(&mut self, path: &Path, autoplay: bool) -> Result<TrackInfo, String> {
        let device = self
            .device
            .as_ref()
            .ok_or("Не найдено устройство вывода звука")?;
        let (source, duration) = decode::open(path)?;

        let player = Player::connect_new(device.mixer());
        player.set_volume(gain(self.volume));
        if !autoplay {
            player.pause(); // ставим паузу ДО добавления звука, чтобы не было щелчка
        }
        player.append(source);

        self.player = Some(player); // старый плеер уничтожается здесь
        self.path = Some(path.to_path_buf());
        self.duration = duration;
        self.loaded = true;

        Ok(TrackInfo {
            path: path.display().to_string(),
            duration_ms: duration.map(|d| d.as_millis() as u64),
        })
    }

    /// Play. Если трек уже доигран — запускаем его заново с начала.
    fn play(&mut self) {
        if !self.ensure_loaded(true) {
            return;
        }
        if let Some(player) = &self.player {
            player.play();
        }
    }

    fn seek(&mut self, position: Duration) {
        // После окончания трека перемотка снова открывает файл (на паузе)
        if !self.ensure_loaded(false) {
            return;
        }
        let position = match self.duration {
            Some(total) => position.min(total),
            None => position,
        };
        if let Some(player) = &self.player {
            if let Err(e) = player.try_seek(position) {
                self.emit(events::ERROR, format!("Перемотка не удалась: {e}"));
            }
        }
    }

    /// Убеждается, что трек загружен в плеер. Возвращает false, если загружать нечего.
    fn ensure_loaded(&mut self, autoplay: bool) -> bool {
        if self.loaded {
            return true;
        }
        let Some(path) = self.path.clone() else {
            return false;
        };
        match self.load(&path, autoplay) {
            Ok(_) => true,
            Err(e) => {
                self.emit(events::ERROR, e);
                false
            }
        }
    }

    /// Вызывается каждые 50 мс, пока трек играет.
    fn tick(&mut self) {
        let Some(player) = &self.player else { return };

        if player.empty() {
            // Звук закончился — трек доигран
            self.loaded = false;
            self.emit(events::ENDED, ());
            self.emit(events::STATE, self.snapshot());
            return;
        }

        let position_ms = player.get_pos().as_millis() as u64;
        self.emit(events::PROGRESS, Progress { position_ms });
    }

    fn snapshot(&self) -> PlayerState {
        let position_ms = match (&self.player, self.loaded) {
            (Some(player), true) => player.get_pos().as_millis() as u64,
            _ => 0,
        };
        PlayerState {
            path: self.path.as_ref().map(|p| p.display().to_string()),
            duration_ms: self.duration.map(|d| d.as_millis() as u64),
            position_ms,
            playing: self.is_playing(),
        }
    }

    fn emit<T: Serialize + Clone>(&self, event: &str, payload: T) {
        // Ошибка возможна только при закрытии окна — её можно спокойно игнорировать
        let _ = self.app.emit(event, payload);
    }
}

/// Ползунок → усиление. Слух воспринимает громкость нелинейно, поэтому
/// квадрат делает ползунок «равномерным»: середина звучит как половина громкости.
fn gain(slider: f32) -> f32 {
    slider * slider
}
