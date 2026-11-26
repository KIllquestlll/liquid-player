// Тексты песен на стороне интерфейса: кеш, события, действия.
//
// В памяти держим тексты только нескольких последних треков (текущий,
// открытый в редакторе и пару предыдущих) — остальные грузятся по запросу.
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect } from "react";
import { createStore, useStore } from "../lib/createStore";
import {
  LYRICS_EVENTS,
  lyricsApi,
  type LyricsData,
  type LyricsProgress,
  type LyricsStatus,
} from "../lib/ipc";
import { updateTrack } from "../library/store";
import { showError, showToast } from "../ui/store";

const CACHE_SIZE = 4;

interface LyricsState {
  byId: Map<string, LyricsData>;
  /** Фоновый поиск (после импорта или по кнопке); null — не идёт */
  progress: LyricsProgress | null;
}

export const lyricsStore = createStore<LyricsState>({ byId: new Map(), progress: null });

function put(data: LyricsData) {
  lyricsStore.set((s) => {
    const byId = new Map(s.byId);
    byId.delete(data.trackId); // переставляем в конец — «недавно использованный»
    byId.set(data.trackId, data);
    while (byId.size > CACHE_SIZE) byId.delete(byId.keys().next().value!);
    return { byId };
  });
  updateTrack(data.trackId, { lyrics: data.status });
}

async function load(trackId: string) {
  try {
    put(await lyricsApi.get(trackId));
  } catch (e) {
    showError(e);
  }
}

/** Текст трека. undefined — ещё загружается. */
export function useLyrics(trackId: string | undefined): LyricsData | undefined {
  const data = useStore(lyricsStore, (s) => (trackId ? s.byId.get(trackId) : undefined));
  useEffect(() => {
    if (trackId && !lyricsStore.get().byId.has(trackId)) void load(trackId);
  }, [trackId]);
  return data;
}

export const useLyricsProgress = () => useStore(lyricsStore, (s) => s.progress);

/** Подписка на события Rust. Возвращает функцию отписки. */
export async function initLyrics(): Promise<() => void> {
  const unlisten = await Promise.all([
    listen<{ trackId: string; status: LyricsStatus }>(LYRICS_EVENTS.changed, (e) => {
      updateTrack(e.payload.trackId, { lyrics: e.payload.status });
      // Если этот текст сейчас на экране — перечитываем
      if (lyricsStore.get().byId.has(e.payload.trackId)) void load(e.payload.trackId);
    }),
    listen<LyricsProgress>(LYRICS_EVENTS.progress, (e) => {
      const p = e.payload;
      if (p.running) {
        lyricsStore.set({ progress: p });
        return;
      }
      const last = lyricsStore.get().progress;
      lyricsStore.set({ progress: null });
      if (last && last.total > 0) {
        showToast(`Тексты песен: найдено ${last.found} из ${last.total}`);
      }
    }),
  ]);
  return () => unlisten.forEach((off) => off());
}

// ---------- Действия ----------

/** Поискать текст одной песни автоматически. */
export const fetchLyrics = (trackId: string) => lyricsApi.fetch([trackId]).catch(showError);

export async function fetchMissingLyrics() {
  try {
    const count = await lyricsApi.fetchMissing();
    showToast(count ? `Ищу тексты для ${count} песен…` : "У всех песен уже есть текст");
  } catch (e) {
    showError(e);
  }
}

export const cancelLyricsSearch = () => lyricsApi.cancel().catch(showError);

/** Обёртка: выполнить действие, положить новый текст в кеш, показать сообщение. */
async function apply(action: Promise<LyricsData>, message: string): Promise<boolean> {
  try {
    put(await action);
    showToast(message);
    return true;
  } catch (e) {
    showError(e);
    return false;
  }
}

export const applyCandidate = (trackId: string, lrclibId: number) =>
  apply(lyricsApi.apply(trackId, lrclibId), "Текст взят с lrclib.net");

export async function importLyricsFile(trackId: string) {
  try {
    const path = await open({
      multiple: false,
      title: "Выберите файл с текстом",
      filters: [{ name: "Текст песни", extensions: ["lrc", "txt"] }],
    });
    if (typeof path !== "string") return false;
    return apply(lyricsApi.importFile(trackId, path), "Текст загружен из файла");
  } catch (e) {
    showError(e);
    return false;
  }
}

export const saveLyrics = (trackId: string, text: string, source: "manual" | "edited") =>
  apply(lyricsApi.save(trackId, text, source), source === "manual" ? "Разметка сохранена" : "Текст сохранён");

export const clearLyrics = (trackId: string) => apply(lyricsApi.clear(trackId), "Текст удалён");

// Сдвиг меняем в интерфейсе сразу, а в базу пишем через 400 мс после последнего нажатия
const offsetTimers = new Map<string, number>();

export function setLyricsOffset(trackId: string, offsetMs: number) {
  const data = lyricsStore.get().byId.get(trackId);
  if (data) put({ ...data, offsetMs });
  window.clearTimeout(offsetTimers.get(trackId));
  offsetTimers.set(
    trackId,
    window.setTimeout(() => lyricsApi.setOffset(trackId, offsetMs).catch(showError), 400),
  );
}

/** 83_450 → "01:23.45" — формат меток LRC */
export function lrcTime(ms: number): string {
  const cs = Math.max(0, Math.round(ms / 10));
  const mm = String(Math.floor(cs / 6000)).padStart(2, "0");
  const ss = String(Math.floor(cs / 100) % 60).padStart(2, "0");
  return `${mm}:${ss}.${String(cs % 100).padStart(2, "0")}`;
}

/** Номер строки, которая звучит в момент `ms` (−1 — ещё ни одна). Двоичный поиск. */
export function lineAt(lines: { timeMs: number }[], ms: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
