//! Библиотека: база треков (SQLite), импорт файлов и папок, теги, обложки, оформление.
//!
//! Где лежат данные (папка данных приложения, %APPDATA%\com.liquidplayer.desktop):
//!   library.db               — база: треки и их оформление
//!   covers/<id>.jpg          — обложка из файла, до 1024 px (для большого плеера)
//!   covers/<id>_s.jpg        — её миниатюра 160 px (списки и размытый фон)
//!   images/<id>-cover-….jpg  — своя обложка (этап 4), + _s.jpg миниатюра
//!   images/<id>-bg-….jpg     — свой фон до 1920 px, + _s.jpg уменьшенный 480 px
//!
//! Файлы модуля:
//!   db.rs         — схема базы и запросы
//!   identify.rs   — идентификатор трека (хеш содержимого)
//!   tags.rs       — чтение тегов (lofty) и исправление «кракозябр» в кириллице
//!   covers.rs     — чтение и сжатие картинок
//!   appearance.rs — своя обложка, свой фон, затемнение, размытие
//!   import.rs     — импорт файлов/папок с прогрессом
//!   commands.rs   — команды Tauri
//! Тексты песен живут в отдельном модуле lyrics/ (та же база, таблица lyrics).

pub mod appearance;
pub mod commands;
mod covers;
mod db;
mod identify;
mod import;
mod tags;

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;

use appearance::{DEFAULT_BLUR, DEFAULT_DIM};

/// Форматы, которые умеет играть аудиодвижок.
pub const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "ogg", "wav", "m4a"];

/// Имена событий для фронтенда.
pub mod events {
    pub const IMPORT_PROGRESS: &str = "library-import-progress";
    pub const CHANGED: &str = "library-changed";
}

/// Трек в том виде, в каком его получает фронтенд.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    /// Хеш содержимого файла — не меняется при переименовании и переносе
    pub id: String,
    pub path: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub track_no: Option<u32>,
    pub duration_ms: Option<u64>,
    /// Обложка, которую надо показывать: своя, если выбрана, иначе из файла.
    /// Это абсолютные пути — фронтенд превращает их в URL через convertFileSrc.
    pub cover: Option<String>,
    pub cover_small: Option<String>,
    pub has_custom_cover: bool,
    /// Есть ли обложка в самом файле (к ней ведёт «Вернуть из файла»)
    pub has_file_cover: bool,
    /// Свой фон (None — фоном служит размытая обложка)
    pub background: Option<String>,
    pub background_small: Option<String>,
    /// Затемнение фона 0..1
    pub dim: f64,
    /// Размытие фона, px (0..60)
    pub blur: f64,
    /// Название/исполнитель/альбом изменены вручную (можно вернуть из тегов)
    pub info_edited: bool,
    /// Текст песни: synced | plain | instrumental | notFound | cleared | none
    pub lyrics: &'static str,
    /// Когда добавлен (мс с 1970 г.)
    pub added_at: i64,
    /// Файла больше нет по сохранённому пути
    pub missing: bool,
}

/// Состояние библиотеки: соединение с базой и пути. Хранится в app.manage().
pub struct Library {
    db: Mutex<Connection>,
    covers_dir: PathBuf,
    images_dir: PathBuf,
    /// Защита от двух импортов одновременно
    importing: AtomicBool,
}

impl Library {
    pub fn open(data_dir: &Path) -> Result<Self, String> {
        let covers_dir = data_dir.join("covers");
        let images_dir = data_dir.join("images");
        for dir in [&covers_dir, &images_dir] {
            std::fs::create_dir_all(dir)
                .map_err(|e| format!("не удалось создать папку данных: {e}"))?;
        }
        let conn = db::open(&data_dir.join("library.db"))
            .map_err(|e| format!("не удалось открыть базу: {e}"))?;
        Ok(Self {
            db: Mutex::new(conn),
            covers_dir,
            images_dir,
            importing: AtomicBool::new(false),
        })
    }

    /// Папки, из которых интерфейсу разрешено показывать картинки.
    pub fn image_dirs(&self) -> [&Path; 2] {
        [&self.covers_dir, &self.images_dir]
    }

    /// Выполнить действие с базой. Блокировка держится только на время `f`.
    pub(crate) fn with_db<T>(&self, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T, String> {
        let conn = self.db.lock().map_err(|_| "база данных недоступна".to_string())?;
        f(&conn).map_err(|e| format!("ошибка базы данных: {e}"))
    }

    fn cover_path(&self, id: &str) -> PathBuf {
        self.covers_dir.join(format!("{id}.jpg"))
    }

    fn cover_small_path(&self, id: &str) -> PathBuf {
        self.covers_dir.join(format!("{id}_s.jpg"))
    }

    fn image_path(&self, base: &str) -> PathBuf {
        self.images_dir.join(format!("{base}.jpg"))
    }

    fn image_small_path(&self, base: &str) -> PathBuf {
        self.images_dir.join(format!("{base}_s.jpg"))
    }

    /// Все треки, новые пачки сверху.
    pub fn list(&self) -> Result<Vec<Track>, String> {
        let rows = self.with_db(db::list)?;
        Ok(rows.into_iter().map(|row| self.to_track(row)).collect())
    }

    /// Один трек.
    pub fn get(&self, id: &str) -> Result<Track, String> {
        Ok(self.to_track(self.get_row(id)?))
    }

    fn get_row(&self, id: &str) -> Result<db::TrackRow, String> {
        self.with_db(|c| db::get(c, id))?
            .ok_or_else(|| "Трек не найден в библиотеке".to_string())
    }

    /// Строка базы → трек для интерфейса (собираем пути к картинкам).
    fn to_track(&self, row: db::TrackRow) -> Track {
        let path_str = |p: PathBuf| Some(p.display().to_string());

        let (cover, cover_small) = match (&row.cover_file, row.has_cover) {
            (Some(base), _) => (path_str(self.image_path(base)), path_str(self.image_small_path(base))),
            (None, true) => (path_str(self.cover_path(&row.id)), path_str(self.cover_small_path(&row.id))),
            (None, false) => (None, None),
        };
        let (background, background_small) = match &row.bg_file {
            Some(base) => (path_str(self.image_path(base)), path_str(self.image_small_path(base))),
            None => (None, None),
        };
        // У треков, добавленных до этапа 5, исходные теги не сохранены — считаем, что правок нет
        let info_edited = row.tag_title.as_ref().is_some_and(|tag| tag != &row.title)
            || (row.tag_title.is_some() && (row.tag_artist != row.artist || row.tag_album != row.album));
        let lyrics = match (row.lyrics_status.as_deref(), row.lyrics_synced) {
            (Some("found"), true) => "synced",
            (Some("found"), false) => "plain",
            (Some("instrumental"), _) => "instrumental",
            (Some("not_found"), _) => "notFound",
            (Some("cleared"), _) => "cleared",
            _ => "none",
        };

        Track {
            info_edited,
            lyrics,
            missing: !Path::new(&row.path).exists(),
            has_custom_cover: row.cover_file.is_some(),
            has_file_cover: row.has_cover,
            cover,
            cover_small,
            background,
            background_small,
            dim: row.dim.unwrap_or(DEFAULT_DIM),
            blur: row.blur.unwrap_or(DEFAULT_BLUR),
            id: row.id,
            path: row.path,
            title: row.title,
            artist: row.artist,
            album: row.album,
            track_no: row.track_no,
            duration_ms: row.duration_ms,
            added_at: row.added_at,
        }
    }

    /// Изменить название, исполнителя и альбом. Пустой исполнитель/альбом = «не указан».
    /// Меняется только запись в библиотеке — сам аудиофайл и его теги не трогаем.
    pub fn update_info(&self, id: &str, title: &str, artist: &str, album: &str) -> Result<Track, String> {
        let title = title.trim();
        if title.is_empty() {
            return Err("Название не может быть пустым".into());
        }
        let opt = |s: &str| {
            let s = s.trim();
            (!s.is_empty()).then_some(s.to_string())
        };
        let (artist, album) = (opt(artist), opt(album));
        self.with_db(|c| db::update_info(c, id, title, artist.as_deref(), album.as_deref()))?;
        self.get(id)
    }

    /// Вернуть название, исполнителя и альбом из тегов файла.
    pub fn reset_info(&self, id: &str) -> Result<Track, String> {
        self.with_db(|c| db::reset_info(c, id))?;
        self.get(id)
    }

    /// Убрать треки из библиотеки вместе с их картинками.
    /// Сами аудиофайлы на диске НЕ удаляются.
    pub fn remove(&self, ids: &[String]) -> Result<(), String> {
        // Сначала узнаём имена своих картинок — после удаления строк их не найти
        let mut custom_images = Vec::new();
        for id in ids {
            if let Ok(row) = self.get_row(id) {
                custom_images.extend(row.cover_file);
                custom_images.extend(row.bg_file);
            }
        }
        self.with_db(|conn| db::delete(conn, ids))?;
        for id in ids {
            let _ = std::fs::remove_file(self.cover_path(id));
            let _ = std::fs::remove_file(self.cover_small_path(id));
        }
        for base in custom_images {
            self.delete_image_files(&base);
        }
        Ok(())
    }
}
