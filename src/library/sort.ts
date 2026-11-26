// Сортировка списка песен: по дате добавления, названию, длительности.
import { prefs } from "../lib/createStore";
import type { Track } from "../lib/ipc";

export type SortKey = "added" | "title" | "duration";
export type SortDir = "asc" | "desc";

export interface SortState {
  key: SortKey;
  dir: SortDir;
}

/** Естественное направление при выборе: новые сверху, А→Я, короткие сверху */
export const DEFAULT_DIR: Record<SortKey, SortDir> = { added: "desc", title: "asc", duration: "asc" };

export const SORT_LABELS: Record<SortKey, string> = {
  added: "Дата",
  title: "Название",
  duration: "Длительность",
};

export const DIR_LABELS: Record<SortKey, Record<SortDir, string>> = {
  added: { desc: "Сначала новые", asc: "Сначала старые" },
  title: { asc: "А → Я", desc: "Я → А" },
  duration: { asc: "Сначала короткие", desc: "Сначала длинные" },
};

// Collator сравнивает строки «по-человечески»: без учёта регистра,
// «Трек 2» раньше «Трек 10» (numeric), русские буквы по алфавиту.
const collator = new Intl.Collator("ru", { sensitivity: "base", numeric: true });

export function sortTracks(tracks: Track[], { key, dir }: SortState): Track[] {
  // База уже отдаёт треки «новые сверху» — лишний раз не сортируем
  if (key === "added" && dir === "desc") return tracks;
  const sign = dir === "asc" ? 1 : -1;
  // sort() в JS стабильный: равные элементы сохраняют исходный порядок
  // (так треки одного альбома остаются по номерам при сортировке по дате)
  return [...tracks].sort((a, b) => {
    switch (key) {
      case "added":
        return sign * (a.addedAt - b.addedAt);
      case "title":
        return sign * collator.compare(a.title, b.title) || collator.compare(a.artist ?? "", b.artist ?? "");
      case "duration":
        // Треки без длительности — всегда в конце
        if (a.durationMs === null) return b.durationMs === null ? 0 : 1;
        if (b.durationMs === null) return -1;
        return sign * (a.durationMs - b.durationMs);
    }
  });
}

export const loadSort = (): SortState => prefs.get<SortState>("musicSort", { key: "added", dir: "desc" });
export const saveSort = (sort: SortState) => prefs.set("musicSort", sort);
