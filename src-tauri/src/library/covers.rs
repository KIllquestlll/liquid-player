//! Картинки: обложки из тегов/папки альбома и картинки, выбранные пользователем.
//!
//! Всё сжимается один раз при сохранении. Интерфейс потом грузит готовые
//! маленькие JPEG-файлы, а не декодирует 3000-пиксельные оригиналы каждый раз.
//! Формат — JPEG: встроенный в крейт image кодировщик WebP умеет только сжатие
//! без потерь, и такие файлы получаются в 5–10 раз больше.

use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ImageDecoder, ImageReader};

/// Обложка: большой плеер показывает её максимум ~660 px, 1024 — с запасом
pub const COVER_MAX: u32 = 1024;
/// Миниатюра обложки: списки (44 px × плотность экрана) и размытый фон
pub const COVER_SMALL: u32 = 160;
/// Фон на весь экран: до 1920 px по длинной стороне
pub const BG_MAX: u32 = 1920;
/// Уменьшенный фон: превью в редакторе и сильно размытый фон (детали всё равно не видны)
pub const BG_SMALL: u32 = 480;

/// Типичные имена файлов-обложек рядом с музыкой.
const FOLDER_COVER_NAMES: &[&str] = &["cover", "folder", "front", "albumart", "album"];

/// Обложка из байтов (тег аудиофайла) → большой файл + миниатюра.
pub fn save(bytes: &[u8], big_path: &Path, small_path: &Path) -> Result<(), String> {
    let img = image::load_from_memory(bytes).map_err(|e| format!("обложка не читается: {e}"))?;
    save_sized(&img, big_path, COVER_MAX, 88)?;
    save_sized(&img, small_path, COVER_SMALL, 82)
}

/// Открыть картинку с диска. Учитывает поворот из EXIF —
/// иначе вертикальные фото с телефона легли бы набок.
pub fn load_file(path: &Path) -> Result<DynamicImage, String> {
    let fail = |e: &dyn std::fmt::Display| format!("Не удалось открыть картинку: {e}");
    let mut decoder = ImageReader::open(path)
        .map_err(|e| fail(&e))?
        .with_guessed_format()
        .map_err(|e| fail(&e))?
        .into_decoder()
        .map_err(|e| fail(&e))?;
    let orientation = decoder.orientation().ok();
    let mut img = DynamicImage::from_decoder(decoder).map_err(|e| fail(&e))?;
    if let Some(orientation) = orientation {
        img.apply_orientation(orientation);
    }
    Ok(img)
}

/// Уменьшить (если больше `max` по длинной стороне) и сохранить в JPEG.
pub fn save_sized(img: &DynamicImage, path: &Path, max: u32, quality: u8) -> Result<(), String> {
    let resized;
    let img = if img.width().max(img.height()) > max {
        // Маленьким размерам хватает быстрого thumbnail, большим — качественный Lanczos
        resized = if max <= 512 {
            img.thumbnail(max, max)
        } else {
            img.resize(max, max, FilterType::Lanczos3) // пропорции сохраняются
        };
        &resized
    } else {
        img
    };

    let file = File::create(path).map_err(|e| format!("не удалось записать картинку: {e}"))?;
    // JPEG не поддерживает прозрачность — переводим в RGB
    let rgb = DynamicImage::ImageRgb8(img.to_rgb8());
    JpegEncoder::new_with_quality(BufWriter::new(file), quality)
        .encode_image(&rgb)
        .map_err(|e| format!("не удалось сжать картинку: {e}"))
}

/// Ищет cover.jpg / folder.png и т.п. в папке с треком.
pub fn find_in_folder(audio_path: &Path) -> Option<Vec<u8>> {
    let dir = audio_path.parent()?;
    let entries = std::fs::read_dir(dir).ok()?;
    let mut best: Option<std::path::PathBuf> = None;
    for entry in entries.flatten() {
        let path = entry.path();
        let (Some(ext), Some(stem)) = (path.extension(), path.file_stem()) else {
            continue;
        };
        let ext = ext.to_string_lossy().to_ascii_lowercase();
        if !matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp") {
            continue;
        }
        let stem = stem.to_string_lossy().to_ascii_lowercase();
        if FOLDER_COVER_NAMES.iter().any(|name| stem.starts_with(name)) {
            // «cover» точнее, чем «folder»/«album» — берём его, если есть
            let is_cover = stem.starts_with("cover") || stem.starts_with("front");
            if best.is_none() || is_cover {
                best = Some(path);
            }
        }
    }
    std::fs::read(best?).ok()
}
