//! Чтение тегов: название, исполнитель, альбом, номер, длительность, встроенная обложка.

use std::path::Path;

use lofty::config::ParseOptions;
use lofty::picture::PictureType;
use lofty::prelude::*; // AudioFile, TaggedFileExt, Accessor, ItemKey
use lofty::probe::Probe;

pub struct Metadata {
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub track_no: Option<u32>,
    pub duration_ms: Option<u64>,
    /// Байты встроенной картинки (jpeg/png как есть)
    pub cover: Option<Vec<u8>>,
}

/// Читает теги. Никогда не падает: если тегов нет — берём название из имени файла.
pub fn read(path: &Path) -> Metadata {
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    let tagged = Probe::open(path)
        .ok()
        .map(|p| p.options(ParseOptions::new()))
        .and_then(|p| p.read().ok());

    let mut meta = Metadata {
        title: String::new(),
        artist: None,
        album: None,
        track_no: None,
        duration_ms: None,
        cover: None,
    };

    if let Some(file) = &tagged {
        let duration = file.properties().duration();
        if !duration.is_zero() {
            meta.duration_ms = Some(duration.as_millis() as u64);
        }

        if let Some(tag) = file.primary_tag().or_else(|| file.first_tag()) {
            meta.title = clean(tag.title().as_deref()).unwrap_or_default();
            meta.artist = clean(tag.artist().as_deref())
                .or_else(|| clean(tag.get_string(ItemKey::AlbumArtist)));
            meta.album = clean(tag.album().as_deref());
            meta.track_no = tag.track();

            // Обложка: сначала «передняя обложка», иначе любая первая картинка
            let pictures = tag.pictures();
            meta.cover = pictures
                .iter()
                .find(|p| p.pic_type() == PictureType::CoverFront)
                .or_else(|| pictures.first())
                .map(|p| p.data().to_vec());
        }
    }

    // Нет названия в тегах → имя файла. «Исполнитель - Песня» разбираем на две части.
    if meta.title.is_empty() {
        match stem.split_once(" - ") {
            Some((artist, title)) if meta.artist.is_none() => {
                meta.artist = Some(artist.trim().to_string());
                meta.title = title.trim().to_string();
            }
            _ => meta.title = stem,
        }
    }
    meta
}

/// Обрезает пробелы, выбрасывает пустые строки, чинит кириллицу.
fn clean(value: Option<&str>) -> Option<String> {
    let v = value?.trim().trim_matches('\0').trim();
    (!v.is_empty()).then(|| fix_cp1251(v))
}

/// Чинит «кракозябры» вида «Ïåñíÿ» → «Песня».
///
/// Старые русские mp3 часто записаны в кодировке Windows-1251, а программа
/// читает их как Latin-1. Байты при этом не теряются — их можно перевести обратно.
/// Переводим, только если «подозрительных» символов большинство, чтобы не
/// испортить настоящие европейские названия вроде «Beyoncé».
pub fn fix_cp1251(s: &str) -> String {
    if s.chars().any(|c| c as u32 > 0xFF) {
        return s.to_string(); // уже нормальный Юникод
    }
    let letters = s.chars().filter(|c| c.is_alphabetic()).count();
    let suspicious = s.chars().filter(|c| matches!(*c as u32, 0xC0..=0xFF)).count();
    if suspicious == 0 || suspicious * 2 < letters {
        return s.to_string();
    }
    s.chars()
        .map(|c| match c as u32 {
            code @ 0xC0..=0xFF => char::from_u32(code - 0xC0 + 0x410).unwrap_or(c), // А..я
            0xA8 => 'Ё',
            0xB8 => 'ё',
            0xB9 => '№',
            0x85 => '…',
            0x96 => '–',
            0x97 => '—',
            _ => c,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::fix_cp1251;

    #[test]
    fn fixes_cyrillic_mojibake() {
        assert_eq!(fix_cp1251("Ïåñíÿ"), "Песня");
        assert_eq!(fix_cp1251("Êèíî - Ãðóïïà êðîâè"), "Кино - Группа крови");
    }

    #[test]
    fn keeps_normal_text() {
        assert_eq!(fix_cp1251("Beyoncé"), "Beyoncé");
        assert_eq!(fix_cp1251("Сплин"), "Сплин");
        assert_eq!(fix_cp1251("Daft Punk"), "Daft Punk");
    }
}
