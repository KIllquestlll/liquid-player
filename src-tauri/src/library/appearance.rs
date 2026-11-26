//! Персональное оформление трека: своя обложка, свой фон, затемнение и размытие.
//!
//! Выбранные картинки копируются в папку данных (images/) и сжимаются —
//! оригинал потом можно удалить или переместить, оформление не пропадёт.
//! Каждая новая картинка получает новое имя файла (со временем в имени),
//! поэтому интерфейс никогда не покажет старую версию из кеша.

use std::path::Path;

use serde::Deserialize;

use super::{covers, db, Library, Track};

/// Значения по умолчанию, пока пользователь не двигал ползунки.
pub const DEFAULT_DIM: f64 = 0.45;
pub const DEFAULT_BLUR: f64 = 40.0;
pub const MAX_BLUR: f64 = 60.0;

/// Какую картинку меняем. Из JS приходит строкой "cover" или "background".
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageKind {
    Cover,
    Background,
}

impl ImageKind {
    /// Колонка в таблице appearance
    pub fn column(self) -> &'static str {
        match self {
            ImageKind::Cover => "cover_file",
            ImageKind::Background => "bg_file",
        }
    }

    fn file_tag(self) -> &'static str {
        match self {
            ImageKind::Cover => "cover",
            ImageKind::Background => "bg",
        }
    }
}

impl Library {
    /// Поставить свою картинку (обложку или фон) из файла `source`.
    pub fn set_image(&self, id: &str, kind: ImageKind, source: &Path) -> Result<Track, String> {
        let old = self.get_row(id)?;

        // Новое имя: <id>-cover-<время>. Большая версия — .jpg, маленькая — _s.jpg
        let base = format!("{id}-{}-{}", kind.file_tag(), now_ms());
        let img = covers::load_file(source)?;
        let (big, small) = match kind {
            ImageKind::Cover => (covers::COVER_MAX, covers::COVER_SMALL),
            ImageKind::Background => (covers::BG_MAX, covers::BG_SMALL),
        };
        covers::save_sized(&img, &self.image_path(&base), big, 88)?;
        covers::save_sized(&img, &self.image_small_path(&base), small, 82)?;

        self.with_db(|c| db::set_image_file(c, id, kind, Some(&base)))?;

        // Старую свою картинку этого же вида удаляем с диска
        let old_base = match kind {
            ImageKind::Cover => old.cover_file,
            ImageKind::Background => old.bg_file,
        };
        if let Some(old_base) = old_base {
            self.delete_image_files(&old_base);
        }
        self.get(id)
    }

    /// Вернуть картинку по умолчанию: обложку из файла / размытую обложку как фон.
    pub fn reset_image(&self, id: &str, kind: ImageKind) -> Result<Track, String> {
        let old = self.get_row(id)?;
        self.with_db(|c| db::set_image_file(c, id, kind, None))?;
        let old_base = match kind {
            ImageKind::Cover => old.cover_file,
            ImageKind::Background => old.bg_file,
        };
        if let Some(old_base) = old_base {
            self.delete_image_files(&old_base);
        }
        self.get(id)
    }

    /// Затемнение (0..1) и размытие (0..60 px).
    pub fn set_params(&self, id: &str, dim: f64, blur: f64) -> Result<(), String> {
        let dim = dim.clamp(0.0, 1.0);
        let blur = blur.clamp(0.0, MAX_BLUR);
        self.with_db(|c| db::set_params(c, id, dim, blur))
    }

    pub(super) fn delete_image_files(&self, base: &str) {
        let _ = std::fs::remove_file(self.image_path(base));
        let _ = std::fs::remove_file(self.image_small_path(base));
    }
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}
