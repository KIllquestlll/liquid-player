//! Открытие аудиофайла.
//!
//! Важно для памяти: файл НЕ читается целиком. Decoder держит открытый файл
//! и декодирует его маленькими кусками по мере воспроизведения (потоково).

use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::time::Duration;

use lofty::config::ParseOptions;
use lofty::prelude::*; // трейт AudioFile → метод .properties()
use lofty::probe::Probe;
use rodio::{Decoder, Source}; // Source → метод .total_duration()

pub type TrackSource = Decoder<BufReader<File>>;

/// Открывает файл и возвращает потоковый декодер + длительность (если её удалось узнать).
pub fn open(path: &Path) -> Result<(TrackSource, Option<Duration>), String> {
    let file = File::open(path).map_err(|e| format!("Не удалось открыть файл: {e}"))?;
    let byte_len = file
        .metadata()
        .map_err(|e| format!("Не удалось прочитать файл: {e}"))?
        .len();

    let mut builder = Decoder::builder()
        .with_data(BufReader::new(file))
        // размер файла + seekable = можно перематывать
        .with_byte_len(byte_len)
        .with_seekable(true)
        // убирает тишину-заполнитель кодека в начале/конце mp3/m4a
        .with_gapless(true);

    // Подсказка по расширению ускоряет и уточняет определение формата
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        builder = builder.with_hint(ext);
    }

    let decoder = builder
        .build()
        .map_err(|e| format!("Формат не поддерживается: {e}"))?;

    // Длительность из заголовков потока; у некоторых mp3 её там нет —
    // тогда спрашиваем lofty, который умеет оценивать по битрейту.
    let duration = decoder
        .total_duration()
        .or_else(|| duration_from_properties(path));

    Ok((decoder, duration))
}

fn duration_from_properties(path: &Path) -> Option<Duration> {
    // Нам нужны только технические свойства: теги и картинки не читаем
    let options = ParseOptions::new().read_tags(false).read_cover_art(false);
    let tagged = Probe::open(path).ok()?.options(options).read().ok()?;
    let duration = tagged.properties().duration();
    (!duration.is_zero()).then_some(duration)
}
