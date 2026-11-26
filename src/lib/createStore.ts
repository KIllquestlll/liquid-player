// Маленькое хранилище состояния (аналог Zustand на 30 строк).
//
// Зачем: часть данных нужна многим компонентам (текущий трек, список треков,
// открытая зона). Компонент подписывается только на нужное поле:
//   const playing = useStore(playerStore, (s) => s.playing);
// и перерисовывается, только когда меняется именно оно.
import { useSyncExternalStore } from "react";

export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((state: T) => Partial<T>)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...next };
      listeners.forEach((notify) => notify());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Селектор должен возвращать примитив или уже существующий объект (не создавать новый). */
export function useStore<T, U>(store: Store<T>, selector: (state: T) => U): U {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}

/** Безопасная работа с localStorage (в редких случаях он недоступен). */
export const prefs = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`liquid-player.${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`liquid-player.${key}`, JSON.stringify(value));
    } catch {
      /* не критично */
    }
  },
};
