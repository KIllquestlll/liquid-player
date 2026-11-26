// Состояние воспроизведения. Позиция обновляется 20 раз в секунду —
// поэтому на неё подписываются только прогресс-бары.
import { createStore, prefs, useStore } from "../lib/createStore";

export interface PlayerState {
  path: string | null;
  durationMs: number | null;
  positionMs: number;
  playing: boolean;
  /** Положение ползунка громкости 0..1 (источник правды — интерфейс) */
  volume: number;
}

const savedVolume = prefs.get<number>("volume", 0.8);

export const playerStore = createStore<PlayerState>({
  path: null,
  durationMs: null,
  positionMs: 0,
  playing: false,
  volume: savedVolume >= 0 && savedVolume <= 1 ? savedVolume : 0.8,
});

export const usePlayer = <U>(selector: (s: PlayerState) => U) => useStore(playerStore, selector);
