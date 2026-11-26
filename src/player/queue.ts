// Очередь воспроизведения: что играет, что дальше, перемешивание и повтор.
//
// context — список, из которого запустили трек (например, «Моя музыка» с поиском),
// order    — тот же список в порядке игры (перемешанный, если включено shuffle).
import { createStore, prefs, useStore } from "../lib/createStore";
import { libraryStore } from "../library/store";
import { navigate, showError, showToast } from "../ui/store";
import { loadPath, onTrackEnded, playPause, seekTo } from "./controller";
import { playerStore } from "./store";

export type RepeatMode = "off" | "all" | "one";

interface QueueState {
  context: string[];
  order: string[];
  index: number;
  currentId: string | null;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Номер запуска песни: растёт при каждом включении (и при повторе) — для истории */
  session: number;
}

export const queueStore = createStore<QueueState>({
  context: [],
  order: [],
  index: -1,
  currentId: null,
  session: 0,
  shuffle: prefs.get("shuffle", false),
  repeat: prefs.get<RepeatMode>("repeat", "off"),
});

export const useQueue = <U>(selector: (s: QueueState) => U) => useStore(queueStore, selector);

/** Текущий трек (объект из библиотеки) — для обложки, названия и т.д. */
export const useCurrentTrack = () => {
  const id = useQueue((s) => s.currentId);
  return useStore(libraryStore, (s) => (id ? s.byId.get(id) : undefined));
};

/** Перемешивание Фишера–Йетса. `first` (если задан) ставится в начало. */
function shuffled(ids: string[], first?: string | null): string[] {
  const rest = ids.filter((id) => id !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first && ids.includes(first) ? [first, ...rest] : rest;
}

async function playAt(index: number) {
  const { order } = queueStore.get();
  const id = order[index];
  const track = id ? libraryStore.get().byId.get(id) : undefined;
  if (!track) return;
  queueStore.set((s) => ({ index, currentId: id, session: s.session + 1 }));
  try {
    await loadPath(track.path, true);
  } catch (e) {
    showError(`«${track.title}»: ${e}`);
  }
}

/** Включить трек `id` из списка `context`. */
export function playTrack(id: string, context: string[]) {
  const order = queueStore.get().shuffle ? shuffled(context, id) : context;
  queueStore.set({ context, order });
  return playAt(order.indexOf(id));
}

/** Слушать весь список. shuffle: true — сразу перемешать. */
export function playAll(context: string[], options: { shuffle?: boolean } = {}) {
  if (!context.length) return;
  if (options.shuffle !== undefined) setShuffle(options.shuffle);
  const order = queueStore.get().shuffle ? shuffled(context) : context;
  queueStore.set({ context, order });
  return playAt(0);
}

/** auto = true — трек доиграл сам (тогда учитываем «повтор одного» и конец списка). */
export function next(auto = false) {
  const { order, index, repeat } = queueStore.get();
  if (!order.length) return;
  if (auto && repeat === "one") return playAt(index);
  let i = index + 1;
  if (i >= order.length) {
    if (auto && repeat === "off") return; // список закончился — тишина
    i = 0;
  }
  return playAt(i);
}

/** Как в Apple Music: если трек играет больше 3 с — сначала в его начало. */
export function prev() {
  const { order, index, repeat } = queueStore.get();
  if (!order.length) return;
  if (playerStore.get().positionMs > 3000) return seekTo(0);
  const i = index > 0 ? index - 1 : repeat === "all" ? order.length - 1 : 0;
  return playAt(i);
}

function setShuffle(on: boolean) {
  const { context, currentId } = queueStore.get();
  const order = on ? shuffled(context, currentId) : context;
  queueStore.set({ shuffle: on, order, index: currentId ? order.indexOf(currentId) : -1 });
  prefs.set("shuffle", on);
}

export const toggleShuffle = () => setShuffle(!queueStore.get().shuffle);

export function cycleRepeat() {
  const order: RepeatMode[] = ["off", "all", "one"];
  const repeat = order[(order.indexOf(queueStore.get().repeat) + 1) % order.length];
  queueStore.set({ repeat });
  prefs.set("repeat", repeat);
}

/** Пробел / большая кнопка. Если ничего не загружено — играем всю библиотеку. */
export function togglePlay() {
  if (playerStore.get().path) return playPause();
  const ids = libraryStore.get().tracks.filter((t) => !t.missing).map((t) => t.id);
  if (ids.length) return playAll(ids);
  navigate("admin");
  showToast("Библиотека пуста — добавьте музыку здесь, в Админ-панели");
}

/**
 * После перезагрузки страницы Rust может продолжать играть.
 * Находим этот трек в библиотеке по пути, чтобы показать его название и обложку.
 */
export function restoreCurrent() {
  const { path } = playerStore.get();
  if (!path || queueStore.get().currentId) return;
  const { tracks } = libraryStore.get();
  const track = tracks.find((t) => t.path === path);
  if (!track) return;
  const context = tracks.map((t) => t.id);
  queueStore.set({ context, order: context, index: context.indexOf(track.id), currentId: track.id });
}

onTrackEnded(() => void next(true));
