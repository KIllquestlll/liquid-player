// Состояние интерфейса: какая зона открыта, полноэкранный плеер, уведомления.
import { createStore, prefs, useStore } from "../lib/createStore";

/** Зоны приложения. */
export type View = "home" | "music" | "playlists" | "admin";
export type AdminTab = "import" | "tracks";
/** Разделы редактора трека */
export type EditorSection = "cover" | "background" | "lyrics";

export interface Toast {
  id: number;
  kind: "info" | "error";
  text: string;
}

interface UiState {
  view: View;
  adminTab: AdminTab;
  /** Какой трек открыт в редакторе админ-панели */
  editTrackId: string | null;
  /** К какому разделу редактора прокрутить при открытии */
  editFocus: EditorSection | null;
  /** Полноэкранный плеер поверх всего */
  nowPlayingOpen: boolean;
  toast: Toast | null;
  /** Над окном держат файлы (перетаскивание) */
  dropHover: boolean;
  /** Левое меню свёрнуто до иконок */
  sidebarCollapsed: boolean;
  /** Какой плейлист открыт в зоне «Плейлисты» */
  openPlaylistId: number | null;
  /** Всплывающее меню «Добавить в плейлист»: какие песни и где показать */
  playlistMenu: { trackIds: string[]; x: number; top: number; bottom: number } | null;
}

export const uiStore = createStore<UiState>({
  view: prefs.get<View>("view", "music"),
  adminTab: "import",
  editTrackId: null,
  editFocus: null,
  nowPlayingOpen: false,
  toast: null,
  dropHover: false,
  sidebarCollapsed: prefs.get("sidebarCollapsed", false),
  openPlaylistId: null,
  playlistMenu: null,
});

/** Открыть плейлист в зоне «Плейлисты». */
export function openPlaylist(id: number | null) {
  uiStore.set({ openPlaylistId: id });
  navigate("playlists");
}

/** Показать меню «Добавить в плейлист» под кнопкой, по которой кликнули. */
export function openPlaylistMenu(trackIds: string[], anchor: HTMLElement) {
  const r = anchor.getBoundingClientRect();
  uiStore.set({ playlistMenu: { trackIds, x: r.right, top: r.top, bottom: r.bottom } });
}

export const closePlaylistMenu = () => uiStore.set({ playlistMenu: null });

export function toggleSidebar() {
  const sidebarCollapsed = !uiStore.get().sidebarCollapsed;
  uiStore.set({ sidebarCollapsed });
  prefs.set("sidebarCollapsed", sidebarCollapsed);
}

export const useUi = <U>(selector: (s: UiState) => U) => useStore(uiStore, selector);

export function navigate(view: View) {
  uiStore.set({ view, nowPlayingOpen: false });
  prefs.set("view", view);
}

export const setAdminTab = (adminTab: AdminTab) => uiStore.set({ adminTab });

/** Открыть трек в редакторе админ-панели (например, из «Моей музыки»).
 *  `focus` — сразу прокрутить к разделу (например, к тексту песни). */
export function editTrack(trackId: string, focus: EditorSection | null = null) {
  uiStore.set({ editTrackId: trackId, adminTab: "tracks", editFocus: focus });
  navigate("admin");
}

export const setNowPlayingOpen = (nowPlayingOpen: boolean) => uiStore.set({ nowPlayingOpen });

export function showToast(text: string, kind: Toast["kind"] = "info") {
  uiStore.set({ toast: { id: Date.now(), kind, text } });
}

export const showError = (e: unknown) => showToast(String(e), "error");

export const dismissToast = () => uiStore.set({ toast: null });
