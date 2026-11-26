/** 83_000 → "1:23", 4_000_000 → "1:06:40" */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Суммарная длительность: "2 ч 15 мин" / "48 мин" */
export function formatTotal(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

const MONTHS = ["янв.", "февр.", "мар.", "апр.", "мая", "июня", "июля", "авг.", "сент.", "окт.", "нояб.", "дек."];

/** Когда это было: «только что», «5 мин назад», «сегодня в 14:32», «вчера в 21:10», «12 нояб.» */
export function formatAgo(ms: number, now = Date.now()): string {
  const diff = now - ms;
  if (diff < 60_000) return "только что";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} мин назад`;
  const d = new Date(ms);
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (ms >= today.getTime()) return `сегодня в ${time}`;
  if (ms >= today.getTime() - 86_400_000) return `вчера в ${time}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "song.flac" → "FLAC" */
export function fileFormat(path: string): string {
  return (path.split(".").pop() ?? "").toUpperCase();
}

/** Русские окончания: plural(5, "трек", "трека", "треков") → "треков" */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Для поиска: нижний регистр, «ё» = «е» */
export const normalize = (s: string) => s.toLowerCase().replaceAll("ё", "е");

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
