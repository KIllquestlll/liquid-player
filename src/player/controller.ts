// Низкоуровневое управление звуком: события Rust → хранилище, команды → Rust.
// Что играть следующим, решает queue.ts.
import { listen } from "@tauri-apps/api/event";
import { PLAYER_EVENTS, playerApi, type PlayerSnapshot, type ProgressPayload } from "../lib/ipc";
import { clamp } from "../lib/format";
import { prefs } from "../lib/createStore";
import { showError } from "../ui/store";
import { playerStore } from "./store";

let endedHandler: (() => void) | null = null;

/** queue.ts подписывается сюда, чтобы включить следующий трек. */
export function onTrackEnded(handler: () => void) {
  endedHandler = handler;
}

// ---------- Плавные «часы» ----------
// Rust присылает позицию раз в 50 мс. Для караоке-подсветки этого мало:
// между событиями досчитываем время сами — «последняя известная позиция +
// сколько прошло с её получения». Так подсветка слов идёт плавно, 60 раз в секунду.
let anchor = { positionMs: 0, at: 0 };

function setAnchor(positionMs: number) {
  anchor = { positionMs, at: performance.now() };
}

/** Текущая позиция с точностью до кадра (для текста песни и ручной разметки). */
export function positionNow(): number {
  const { playing, durationMs } = playerStore.get();
  const pos = playing ? anchor.positionMs + (performance.now() - anchor.at) : anchor.positionMs;
  return durationMs ? Math.min(pos, durationMs) : pos;
}

/** Вызывается один раз при старте. Возвращает функцию отписки. */
export async function initPlayer(): Promise<() => void> {
  const unlisten = await Promise.all([
    listen<PlayerSnapshot>(PLAYER_EVENTS.state, (e) => {
      setAnchor(e.payload.positionMs);
      playerStore.set(e.payload);
    }),
    listen<ProgressPayload>(PLAYER_EVENTS.progress, (e) => {
      setAnchor(e.payload.positionMs);
      playerStore.set({ positionMs: e.payload.positionMs });
    }),
    listen<string>(PLAYER_EVENTS.error, (e) => showError(e.payload)),
    listen(PLAYER_EVENTS.ended, () => endedHandler?.()),
  ]);

  // Синхронизация: если страницу перезагрузили во время игры, Rust продолжает играть
  try {
    const state = await playerApi.getState();
    setAnchor(state.positionMs);
    playerStore.set(state);
    await playerApi.setVolume(playerStore.get().volume);
  } catch (e) {
    showError(e);
  }

  return () => unlisten.forEach((off) => off());
}

/** Загрузить файл в плеер. Ошибку пробрасывает вызывающему. */
export async function loadPath(path: string, autoplay = true) {
  const info = await playerApi.load(path, autoplay);
  setAnchor(0);
  playerStore.set({ path: info.path, durationMs: info.durationMs, positionMs: 0 });
}

export const playPause = () => playerApi.toggle().catch(showError);

export function seekTo(positionMs: number) {
  const { path, durationMs } = playerStore.get();
  if (!path || !durationMs) return;
  const target = clamp(positionMs, 0, durationMs);
  setAnchor(target);
  playerStore.set({ positionMs: target }); // сразу двигаем ползунок, не дожидаясь Rust
  return playerApi.seek(target).catch(showError);
}

export const seekBy = (deltaMs: number) => seekTo(playerStore.get().positionMs + deltaMs);

export function setVolume(volume: number) {
  const v = clamp(Math.round(volume * 100) / 100, 0, 1);
  playerStore.set({ volume: v });
  prefs.set("volume", v);
  return playerApi.setVolume(v).catch(showError);
}
