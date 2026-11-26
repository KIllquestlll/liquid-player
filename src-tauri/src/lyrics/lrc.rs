//! Разбор формата LRC.
//!
//! Обычный LRC — строка с меткой времени:
//!     [01:23.45]Текст строки
//! Несколько меток на одну строку (повтор припева):
//!     [00:40.00][01:50.00]Припев
//! Служебные теги: [ar:Исполнитель] [ti:Название] [offset:+250] — сдвиг в мс
//! Enhanced LRC — метки на каждом слове:
//!     [00:12.00]<00:12.00>Ска<00:12.40>жи, <00:12.90>ку<00:13.20>кушка

use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Word {
    pub time_ms: u64,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Line {
    pub time_ms: u64,
    pub text: String,
    /// Пусто, если в строке нет пословных меток
    pub words: Vec<Word>,
}

/// Разобрать LRC. Строки без меток времени пропускаются, результат отсортирован по времени.
/// Тег [offset:] уже учтён во временах.
pub fn parse(text: &str) -> Vec<Line> {
    let mut lines = Vec::new();
    let mut offset_ms: i64 = 0;

    for raw in text.lines() {
        let mut rest = raw.trim().trim_start_matches('\u{feff}');
        let mut times = Vec::new();

        // Снимаем все [..] в начале строки: это метки времени или служебные теги
        while let Some(stripped) = rest.strip_prefix('[') {
            let Some(end) = stripped.find(']') else { break };
            let tag = &stripped[..end];
            if let Some(ms) = parse_time(tag) {
                times.push(ms);
            } else if let Some((key, value)) = tag.split_once(':') {
                if key.trim().eq_ignore_ascii_case("offset") {
                    offset_ms = value.trim().trim_start_matches('+').parse().unwrap_or(0);
                }
            }
            rest = &stripped[end + 1..];
        }

        if times.is_empty() {
            continue;
        }
        let (text, words) = parse_words(rest.trim());
        for time_ms in times {
            lines.push(Line { time_ms, text: text.clone(), words: words.clone() });
        }
    }

    // [offset:+500] означает «текст на 0,5 с раньше» — вычитаем
    if offset_ms != 0 {
        let shift = |t: u64| (t as i64 - offset_ms).max(0) as u64;
        for line in &mut lines {
            line.time_ms = shift(line.time_ms);
            for word in &mut line.words {
                word.time_ms = shift(word.time_ms);
            }
        }
    }

    // sort_by_key стабильный: строки с одинаковым временем сохраняют порядок
    lines.sort_by_key(|l| l.time_ms);
    lines
}

/// "01:23.45" / "1:23.456" / "01:23" / "01:23:45" → миллисекунды
fn parse_time(tag: &str) -> Option<u64> {
    let tag = tag.trim();
    let (min, rest) = tag.split_once(':')?;
    let minutes: u64 = min.trim().parse().ok()?;
    // секунды и доли могут быть разделены точкой или (реже) двоеточием
    let (sec, frac) = match rest.split_once(['.', ':']) {
        Some((s, f)) => (s, Some(f)),
        None => (rest, None),
    };
    if sec.is_empty() || !sec.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let seconds: u64 = sec.parse().ok()?;
    let millis = match frac {
        Some(f) if !f.is_empty() && f.chars().all(|c| c.is_ascii_digit()) => {
            // .4 → 400, .45 → 450, .456 → 456
            let digits: String = f.chars().chain("000".chars()).take(3).collect();
            digits.parse().ok()?
        }
        Some(_) => return None,
        None => 0,
    };
    Some(minutes * 60_000 + seconds * 1000 + millis)
}

/// Пословные метки <mm:ss.xx>. Возвращает чистый текст строки и слова.
fn parse_words(text: &str) -> (String, Vec<Word>) {
    if !text.contains('<') {
        return (text.to_string(), Vec::new());
    }
    let mut words: Vec<Word> = Vec::new();
    let mut plain = String::new();
    let mut rest = text;
    let mut current: Option<u64> = None;

    loop {
        let next_tag = rest.find('<');
        let chunk = &rest[..next_tag.unwrap_or(rest.len())];
        if !chunk.is_empty() {
            plain.push_str(chunk);
            match current {
                Some(time_ms) => words.push(Word { time_ms, text: chunk.to_string() }),
                // текст до первой метки приклеиваем к предыдущему слову (или теряем метку)
                None => {
                    if let Some(last) = words.last_mut() {
                        last.text.push_str(chunk);
                    }
                }
            }
            current = None;
        }
        let Some(start) = next_tag else { break };
        let after = &rest[start + 1..];
        match after.find('>') {
            Some(end) => {
                match parse_time(&after[..end]) {
                    Some(ms) => current = Some(ms),
                    // не метка — обычный символ «<»
                    None => plain.push('<'),
                }
                rest = &after[end + 1..];
            }
            None => {
                plain.push_str(&rest[start..]);
                break;
            }
        }
    }
    let plain = plain.split_whitespace().collect::<Vec<_>>().join(" ");
    (plain, words)
}

/// Текст без меток времени (для «обычного» вида и для поиска).
pub fn to_plain(lines: &[Line]) -> String {
    lines.iter().map(|l| l.text.as_str()).collect::<Vec<_>>().join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_lines_sorted() {
        let lines = parse("[ar:Кино]\n[00:44.56] Скажи, кукушка\n[00:36.87]Песен ещё ненаписанных\nбез метки\n");
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].time_ms, 36_870);
        assert_eq!(lines[0].text, "Песен ещё ненаписанных");
        assert_eq!(lines[1].time_ms, 44_560);
        assert_eq!(lines[1].text, "Скажи, кукушка");
    }

    #[test]
    fn time_formats() {
        assert_eq!(parse_time("01:23.45"), Some(83_450));
        assert_eq!(parse_time("1:23.456"), Some(83_456));
        assert_eq!(parse_time("01:23.4"), Some(83_400));
        assert_eq!(parse_time("01:23"), Some(83_000));
        assert_eq!(parse_time("01:23:45"), Some(83_450));
        assert_eq!(parse_time("ar:Кино"), None);
        assert_eq!(parse_time("offset:+250"), None);
    }

    #[test]
    fn repeated_timestamps_and_offset() {
        let lines = parse("[offset:+500]\n[00:40.00][01:50.00]Припев\n[00:10.00]Куплет");
        let times: Vec<u64> = lines.iter().map(|l| l.time_ms).collect();
        assert_eq!(times, vec![9_500, 39_500, 109_500]);
        assert_eq!(lines[1].text, "Припев");
    }

    #[test]
    fn enhanced_word_timing() {
        let lines = parse("[00:12.00]<00:12.00>Ска<00:12.40>жи, <00:12.90>кукушка <00:14.00>");
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].text, "Скажи, кукушка");
        let words: Vec<(u64, &str)> = lines[0].words.iter().map(|w| (w.time_ms, w.text.as_str())).collect();
        assert_eq!(words, vec![(12_000, "Ска"), (12_400, "жи, "), (12_900, "кукушка ")]);
    }

    #[test]
    fn empty_line_kept_as_pause() {
        let lines = parse("[00:01.00]Раз\n[00:05.00]\n[00:09.00]Два");
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[1].text, "");
    }

    #[test]
    fn manual_markup_format() {
        // так записывает строки ручная разметка в интерфейсе
        let lines = parse("[01:01.23]Строка\n[01:05.00]Вторая");
        assert_eq!(lines[0].time_ms, 61_230);
        assert_eq!(to_plain(&lines), "Строка\nВторая");
    }
}
