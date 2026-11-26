// Плейлисты и «Недавно прослушанное» на стороне интерфейса.
import { listen } from "@tauri-apps/api/event";
import { createStore, useStore } from "../lib/createStore";
import { plural } from "../lib/format";
import { historyApi, LIBRARY_EVENTS, playlistsApi, type HistoryItem, type Playlist } from "../lib/ipc";
import { playerStore } from "../player/store";
import { queueStore } from "../player/queue";
import { showError, showToast } from "../ui/store";

interface PlaylistsState {
  playlists: Playlist[];
  recent: HistoryItem[];
}

export const playlistsStore = createStore<PlaylistsState>({ playlists: [], recent: [] });

export const usePlaylists = <U>(selector: (s: PlaylistsState) => U) => useStore(playlistsStore, selector);

async function reloadPlaylists() {
  try {
    playlistsStore.set({ playlists: await playlistsApi.list() });
  } catch (e) {
    showError(e);
  }
}

async function reloadRecent() {
  try {
    playlistsStore.set({ recent: await historyApi.recent(60) });
  } catch (e) {
    showError(e);
  }
}

/** Заменить один плейлист в списке (или добавить новый наверх). */
function putPlaylist(p: Playlist) {
  playlistsStore.set((s) => ({
    playlists: s.playlists.some((x) => x.id === p.id)
      ? s.playlists.map((x) => (x.id === p.id ? p : x))
      : [p, ...s.playlists],
  }));
}

// ---------- Плейлисты ----------

export async function createPlaylist(name: string, trackIds: string[] = []): Promise<Playlist | null> {
  try {
    const p = await playlistsApi.create(name.trim() || "Новый плейлист", trackIds);
    putPlaylist(p);
    showToast(`Плейлист «${p.name}» создан${trackIds.length ? ` · ${songs(p.trackIds.length)}` : ""}`);
    return p;
  } catch (e) {
    showError(e);
    return null;
  }
}

export async function renamePlaylist(id: number, name: string) {
  try {
    putPlaylist(await playlistsApi.rename(id, name));
  } catch (e) {
    showError(e);
  }
}

export async function deletePlaylist(id: number) {
  try {
    await playlistsApi.remove(id);
    playlistsStore.set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) }));
    showToast("Плейлист удалён (песни остались в библиотеке)");
  } catch (e) {
    showError(e);
  }
}

export async function addToPlaylist(id: number, trackIds: string[]) {
  try {
    const before = playlistsStore.get().playlists.find((p) => p.id === id)?.trackIds.length ?? 0;
    const p = await playlistsApi.addTracks(id, trackIds);
    putPlaylist(p);
    const added = p.trackIds.length - before;
    showToast(added > 0 ? `Добавлено в «${p.name}»: ${songs(added)}` : `Уже есть в «${p.name}»`);
  } catch (e) {
    showError(e);
  }
}

export async function removeFromPlaylist(id: number, trackIds: string[]) {
  try {
    putPlaylist(await playlistsApi.removeTracks(id, trackIds));
  } catch (e) {
    showError(e);
  }
}

/** Сдвинуть песню на `delta` позиций (−1 — выше, +1 — ниже). */
export async function moveInPlaylist(id: number, trackId: string, delta: number) {
  const p = playlistsStore.get().playlists.find((x) => x.id === id);
  if (!p) return;
  const from = p.trackIds.indexOf(trackId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= p.trackIds.length) return;
  const order = [...p.trackIds];
  [order[from], order[to]] = [order[to], order[from]];
  putPlaylist({ ...p, trackIds: order }); // сразу на экране, не дожидаясь базы
  try {
    putPlaylist(await playlistsApi.reorder(id, order));
  } catch (e) {
    showError(e);
  }
}

const songs = (n: number) => `${n} ${plural(n, "песня", "песни", "песен")}`;

// ---------- Недавно прослушанное ----------

export async function clearHistory() {
  try {
    await historyApi.clear();
    playlistsStore.set({ recent: [] });
    showToast("История прослушиваний очищена");
  } catch (e) {
    showError(e);
  }
}

export async function removeFromHistory(trackId: string) {
  try {
    await historyApi.remove(trackId);
    playlistsStore.set((s) => ({ recent: s.recent.filter((r) => r.trackId !== trackId) }));
  } catch (e) {
    showError(e);
  }
}

/**
 * Когда считать песню «прослушанной»: после 30 секунд или половины песни
 * (что наступит раньше). Короткие «пролистывания» в историю не попадают.
 * Каждый запуск песни (в том числе повтор) записывается один раз.
 */
function watchListening(): () => void {
  // Номер запуска, который уже записан (queue.ts увеличивает session при каждом запуске песни)
  let recordedSession = -1;
  return playerStore.subscribe(() => {
    const { currentId, session } = queueStore.get();
    const { positionMs, durationMs, playing } = playerStore.get();
    if (!currentId || !playing || recordedSession === session) return;
    const threshold = durationMs ? Math.min(30_000, durationMs / 2) : 30_000;
    if (positionMs >= threshold) {
      recordedSession = session;
      historyApi.add(currentId).then(reloadRecent).catch(() => {});
    }
  });
}

/** Загрузка при старте и подписки. Возвращает функцию отписки. */
export async function initPlaylists(): Promise<() => void> {
  await Promise.all([reloadPlaylists(), reloadRecent()]);
  // Песню убрали из библиотеки — она пропала и из плейлистов, и из истории
  const offLibrary = await listen(LIBRARY_EVENTS.changed, () => {
    void reloadPlaylists();
    void reloadRecent();
  });
  const offWatch = watchListening();
  return () => {
    offLibrary();
    offWatch();
  };
}
