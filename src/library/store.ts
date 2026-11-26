// Библиотека на стороне интерфейса: список треков, импорт, удаление.
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { createStore, useStore } from "../lib/createStore";
import { plural } from "../lib/format";
import {
  LIBRARY_EVENTS,
  libraryApi,
  type ImportProgress,
  type ImportSummary,
  type Track,
} from "../lib/ipc";
import { showError, showToast, uiStore } from "../ui/store";

export const AUDIO_EXTENSIONS = ["mp3", "flac", "ogg", "wav", "m4a"];

interface LibraryState {
  tracks: Track[];
  byId: Map<string, Track>;
  loaded: boolean;
  /** Идёт импорт — прогресс; null — не идёт */
  importing: ImportProgress | null;
  lastImport: ImportSummary | null;
}

export const libraryStore = createStore<LibraryState>({
  tracks: [],
  byId: new Map(),
  loaded: false,
  importing: null,
  lastImport: null,
});

export const useLibrary = <U>(selector: (s: LibraryState) => U) => useStore(libraryStore, selector);

/** Заменить/дополнить один трек в хранилище (без перезагрузки всей библиотеки). */
export function updateTrack(id: string, patch: Partial<Track>) {
  libraryStore.set((s) => {
    const old = s.byId.get(id);
    if (!old) return {};
    const updated = { ...old, ...patch };
    const byId = new Map(s.byId);
    byId.set(id, updated);
    return { tracks: s.tracks.map((t) => (t.id === id ? updated : t)), byId };
  });
}

export async function refreshLibrary() {
  try {
    const tracks = await libraryApi.list();
    libraryStore.set({ tracks, byId: new Map(tracks.map((t) => [t.id, t])), loaded: true });
  } catch (e) {
    showError(e);
  }
}

/**
 * Идёт ли импорт, запущенный из интерфейса. Нужен из-за гонки: последнее событие
 * прогресса может прийти уже ПОСЛЕ ответа команды — его надо проигнорировать,
 * иначе карточка «Импорт 9 из 9» осталась бы висеть, а кнопки — заблокированными.
 */
let importActive = false;

/** Подписки на события импорта. Возвращает функцию отписки. */
export async function initLibrary(): Promise<() => void> {
  const unlisten = await Promise.all([
    listen<ImportProgress>(LIBRARY_EVENTS.importProgress, (e) => {
      if (importActive) libraryStore.set({ importing: e.payload });
    }),
    listen(LIBRARY_EVENTS.changed, () => void refreshLibrary()),
  ]);
  await refreshLibrary();
  return () => unlisten.forEach((off) => off());
}

/** Файлы и папки → в библиотеку. */
export async function importPaths(paths: string[]) {
  if (!paths.length || importActive) return;
  importActive = true;
  libraryStore.set({ importing: { done: 0, total: 0, current: "" } });
  try {
    const summary = await libraryApi.import(paths);
    libraryStore.set({ lastImport: summary });
    showToast(describeImport(summary), summary.errors.length && !summary.added ? "error" : "info");
  } catch (e) {
    showError(e);
  } finally {
    importActive = false;
    libraryStore.set({ importing: null });
  }
}

export async function pickFiles() {
  try {
    const files = await open({
      multiple: true,
      title: "Выберите аудиофайлы",
      filters: [{ name: "Аудио", extensions: AUDIO_EXTENSIONS }],
    });
    if (files) await importPaths(files);
  } catch (e) {
    showError(e);
  }
}

export async function pickFolder() {
  try {
    const folder = await open({ directory: true, multiple: false, title: "Выберите папку с музыкой" });
    if (folder) await importPaths([folder]);
  } catch (e) {
    showError(e);
  }
}

/** Убрать из библиотеки (файлы на диске остаются). */
export async function removeTracks(ids: string[]) {
  if (!ids.length) return;
  try {
    await libraryApi.remove(ids);
    showToast(`Убрано из библиотеки: ${ids.length} ${plural(ids.length, "трек", "трека", "треков")}`);
  } catch (e) {
    showError(e);
  }
}

/** Перетаскивание файлов и папок в любое место окна → импорт. */
export function initDragDrop() {
  return getCurrentWebview().onDragDropEvent((event) => {
    const p = event.payload;
    if (p.type === "enter") uiStore.set({ dropHover: true });
    else if (p.type === "leave") uiStore.set({ dropHover: false });
    else if (p.type === "drop") {
      uiStore.set({ dropHover: false });
      void importPaths(p.paths);
    }
  });
}

export function describeImport(s: ImportSummary): string {
  if (s.total === 0) return "Аудиофайлы не найдены (поддерживаются MP3, FLAC, OGG, WAV, M4A)";
  const parts = [`Добавлено: ${s.added}`];
  if (s.relinked) parts.push(`найдены переехавшие: ${s.relinked}`);
  if (s.skipped) parts.push(`уже были: ${s.skipped}`);
  if (s.errors.length) parts.push(`ошибок: ${s.errors.length}`);
  return parts.join(" · ");
}
