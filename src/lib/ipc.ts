// Типизированные обёртки над командами Rust.
// Компоненты вызывают эти функции, а не invoke("строка") напрямую:
// так опечатка в имени команды или поле ловится компилятором TypeScript.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

/** true, если страница открыта внутри окна Tauri, а не в обычном браузере. */
export const isTauri = () => "__TAURI_INTERNALS__" in window;

/** Путь к картинке на диске → URL, который можно поставить в <img src>. */
export const fileUrl = (path: string) => convertFileSrc(path);

// ---------- Общее ----------

export interface AppInfo {
  name: string;
  version: string;
  tauriVersion: string;
  dataDir: string;
}

export const getAppInfo = () => invoke<AppInfo>("app_info");

// ---------- Плеер (src-tauri/src/audio) ----------

export interface TrackInfo {
  path: string;
  durationMs: number | null;
}

export interface PlayerSnapshot {
  path: string | null;
  durationMs: number | null;
  positionMs: number;
  playing: boolean;
}

export interface ProgressPayload {
  positionMs: number;
}

/** Имена событий — те же строки, что в audio/mod.rs → mod events. */
export const PLAYER_EVENTS = {
  state: "player-state",
  progress: "player-progress",
  ended: "player-ended",
  error: "player-error",
} as const;

export const playerApi = {
  load: (path: string, autoplay = true) => invoke<TrackInfo>("player_load", { path, autoplay }),
  getState: () => invoke<PlayerSnapshot>("player_get_state"),
  play: () => invoke<void>("player_play"),
  pause: () => invoke<void>("player_pause"),
  toggle: () => invoke<void>("player_toggle"),
  // u64 в Rust — только целые неотрицательные числа
  seek: (positionMs: number) =>
    invoke<void>("player_seek", { positionMs: Math.max(0, Math.round(positionMs)) }),
  setVolume: (volume: number) => invoke<void>("player_set_volume", { volume }),
};

// ---------- Библиотека (src-tauri/src/library) ----------

export interface Track {
  id: string;
  path: string;
  title: string;
  artist: string | null;
  album: string | null;
  trackNo: number | null;
  durationMs: number | null;
  /** Обложка для показа (своя, если выбрана, иначе из файла): 1024 px и миниатюра 160 px */
  cover: string | null;
  coverSmall: string | null;
  hasCustomCover: boolean;
  /** Есть ли обложка в самом аудиофайле */
  hasFileCover: boolean;
  /** Свой фон: до 1920 px и уменьшенный 480 px. null — фоном служит размытая обложка */
  background: string | null;
  backgroundSmall: string | null;
  /** Затемнение фона 0..1 */
  dim: number;
  /** Размытие фона, px (0..60) */
  blur: number;
  /** Название/исполнитель/альбом изменены вручную (можно вернуть из тегов) */
  infoEdited: boolean;
  /** Есть ли текст песни */
  lyrics: LyricsStatus;
  addedAt: number;
  /** Файла нет по сохранённому пути */
  missing: boolean;
}

export interface ImportSummary {
  total: number;
  added: number;
  relinked: number;
  skipped: number;
  errors: { path: string; message: string }[];
}

export interface ImportProgress {
  done: number;
  total: number;
  current: string;
}

export const LIBRARY_EVENTS = {
  importProgress: "library-import-progress",
  changed: "library-changed",
} as const;

export const libraryApi = {
  list: () => invoke<Track[]>("library_list"),
  import: (paths: string[]) => invoke<ImportSummary>("library_import", { paths }),
  remove: (ids: string[]) => invoke<void>("library_remove", { ids }),
};

/** Название, исполнитель, альбом — меняются только в библиотеке, файл не трогается. */
export const trackApi = {
  updateInfo: (id: string, title: string, artist: string, album: string) =>
    invoke<Track>("track_update_info", { id, title, artist, album }),
  resetInfo: (id: string) => invoke<Track>("track_reset_info", { id }),
};

// ---------- Плейлисты и история (src-tauri/src/playlists) ----------

export interface Playlist {
  id: number;
  name: string;
  /** Песни по порядку */
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface HistoryItem {
  trackId: string;
  lastPlayedAt: number;
  plays: number;
}

export const playlistsApi = {
  list: () => invoke<Playlist[]>("playlists_list"),
  create: (name: string, trackIds: string[] = []) => invoke<Playlist>("playlist_create", { name, trackIds }),
  rename: (id: number, name: string) => invoke<Playlist>("playlist_rename", { id, name }),
  remove: (id: number) => invoke<void>("playlist_delete", { id }),
  addTracks: (id: number, trackIds: string[]) => invoke<Playlist>("playlist_add_tracks", { id, trackIds }),
  removeTracks: (id: number, trackIds: string[]) => invoke<Playlist>("playlist_remove_tracks", { id, trackIds }),
  reorder: (id: number, trackIds: string[]) => invoke<Playlist>("playlist_reorder", { id, trackIds }),
};

export const historyApi = {
  add: (trackId: string) => invoke<void>("history_add", { trackId }),
  recent: (limit = 60) => invoke<HistoryItem[]>("history_recent", { limit }),
  remove: (trackId: string) => invoke<void>("history_remove", { trackId }),
  clear: () => invoke<void>("history_clear"),
};

// ---------- Тексты песен (src-tauri/src/lyrics) ----------

export type LyricsStatus = "synced" | "plain" | "instrumental" | "notFound" | "cleared" | "none";

export interface LyricWord {
  timeMs: number;
  text: string;
}

export interface LyricLine {
  timeMs: number;
  text: string;
  /** Пословные метки (enhanced LRC); пусто — их нет */
  words: LyricWord[];
}

export interface LyricsData {
  trackId: string;
  status: LyricsStatus;
  /** lrclib | file | manual | edited */
  source: string | null;
  lines: LyricLine[];
  plain: string | null;
  /** Исходный LRC — для редактирования */
  raw: string | null;
  /** Ручной сдвиг: + текст позже, − раньше */
  offsetMs: number;
  hasWords: boolean;
}

export interface LyricsCandidate {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  durationMs: number | null;
  synced: boolean;
  plain: boolean;
  instrumental: boolean;
  preview: string;
}

export interface LyricsProgress {
  done: number;
  total: number;
  found: number;
  current: string;
  running: boolean;
}

export const LYRICS_EVENTS = {
  changed: "lyrics-changed",
  progress: "lyrics-progress",
} as const;

export const lyricsApi = {
  get: (trackId: string) => invoke<LyricsData>("lyrics_get", { trackId }),
  fetch: (trackIds: string[]) => invoke<void>("lyrics_fetch", { trackIds }),
  fetchMissing: () => invoke<number>("lyrics_fetch_missing"),
  cancel: () => invoke<void>("lyrics_cancel"),
  search: (title: string, artist: string) => invoke<LyricsCandidate[]>("lyrics_search", { title, artist }),
  apply: (trackId: string, lrclibId: number) => invoke<LyricsData>("lyrics_apply", { trackId, lrclibId }),
  importFile: (trackId: string, path: string) => invoke<LyricsData>("lyrics_import_file", { trackId, path }),
  save: (trackId: string, text: string, source: "manual" | "edited") =>
    invoke<LyricsData>("lyrics_save", { trackId, text, source }),
  setOffset: (trackId: string, offsetMs: number) => invoke<void>("lyrics_set_offset", { trackId, offsetMs }),
  clear: (trackId: string) => invoke<LyricsData>("lyrics_clear", { trackId }),
};

// ---------- Оформление трека (src-tauri/src/library/appearance.rs) ----------

export type ImageKind = "cover" | "background";

export const appearanceApi = {
  /** Своя обложка / свой фон из картинки на диске. Возвращает обновлённый трек. */
  setImage: (id: string, kind: ImageKind, source: string) =>
    invoke<Track>("appearance_set_image", { id, kind, source }),
  /** Вернуть обложку из файла / размытую обложку вместо фона. */
  resetImage: (id: string, kind: ImageKind) => invoke<Track>("appearance_reset_image", { id, kind }),
  setParams: (id: string, dim: number, blur: number) =>
    invoke<void>("appearance_set_params", { id, dim, blur }),
};
