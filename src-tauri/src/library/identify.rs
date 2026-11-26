//! Идентификатор трека — хеш содержимого.
//!
//! Зачем: путь к файлу меняется при переименовании/переносе, а содержимое — нет.
//! По хешу мы узнаём «старый» трек и не теряем его настройки (обложку, фон, текст).
//!
//! Чтобы не читать файлы целиком (FLAC бывает 50+ МБ), хешируем три куска
//! по 64 КБ: начало, середину и конец звуковых данных. Теги в начале mp3
//! (ID3v2) и flac (блоки метаданных) пропускаем — тогда смена тегов или
//! встроенной обложки в другой программе тоже не меняет идентификатор.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use xxhash_rust::xxh3::xxh3_128;

const CHUNK: u64 = 64 * 1024;

pub fn track_id(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let size = file.metadata()?.len();
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let (start, end) = audio_region(&mut file, size, &ext).unwrap_or((0, size));
    let len = end.saturating_sub(start);

    let mut data = Vec::with_capacity((CHUNK * 3) as usize + 8);
    data.extend_from_slice(&len.to_le_bytes());
    if len <= CHUNK * 3 {
        file.seek(SeekFrom::Start(start))?;
        file.by_ref().take(len).read_to_end(&mut data)?;
    } else {
        for offset in [start, start + len / 2 - CHUNK / 2, end - CHUNK] {
            file.seek(SeekFrom::Start(offset))?;
            let mut buf = vec![0u8; CHUNK as usize];
            file.read_exact(&mut buf)?;
            data.extend_from_slice(&buf);
        }
    }
    Ok(format!("{:032x}", xxh3_128(&data)))
}

/// Где в файле начинаются и заканчиваются звуковые данные (без тегов).
fn audio_region(file: &mut File, size: u64, ext: &str) -> std::io::Result<(u64, u64)> {
    match ext {
        "mp3" => {
            let mut start = 0;
            let mut header = [0u8; 10];
            file.read_exact(&mut header)?;
            if &header[0..3] == b"ID3" {
                // размер ID3v2 записан «syncsafe»: по 7 бит в каждом из 4 байт
                let tag_size = header[6..10]
                    .iter()
                    .fold(0u64, |acc, b| (acc << 7) | (*b as u64 & 0x7f));
                let footer = if header[5] & 0x10 != 0 { 10 } else { 0 };
                start = 10 + tag_size + footer;
            }
            // ID3v1 — последние 128 байт, начинаются с "TAG"
            let mut end = size;
            if size >= 128 {
                let mut tail = [0u8; 3];
                file.seek(SeekFrom::Start(size - 128))?;
                file.read_exact(&mut tail)?;
                if &tail == b"TAG" {
                    end = size - 128;
                }
            }
            Ok((start.min(end), end))
        }
        "flac" => {
            // "fLaC", затем блоки метаданных: 1 байт (флаг «последний» + тип) и 3 байта длины
            let mut magic = [0u8; 4];
            file.read_exact(&mut magic)?;
            if &magic != b"fLaC" {
                return Ok((0, size));
            }
            let mut pos = 4u64;
            loop {
                let mut block = [0u8; 4];
                file.seek(SeekFrom::Start(pos))?;
                file.read_exact(&mut block)?;
                let len = u32::from_be_bytes([0, block[1], block[2], block[3]]) as u64;
                pos += 4 + len;
                if block[0] & 0x80 != 0 || pos >= size {
                    break;
                }
            }
            Ok((pos.min(size), size))
        }
        _ => Ok((0, size)),
    }
}
