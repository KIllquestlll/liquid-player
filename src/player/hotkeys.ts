// Горячие клавиши:
//   Пробел           — пауза / воспроизведение
//   ← / →            — перемотка на 5 с (с Shift — на 15 с)
//   ↑ / ↓            — громкость ±5%
//   Медиаклавиши     — пауза, следующий, предыдущий (когда окно в фокусе)
//   Esc              — свернуть полноэкранный плеер
import { setNowPlayingOpen, uiStore } from "../ui/store";
import { seekBy, setVolume } from "./controller";
import { next, prev, togglePlay } from "./queue";
import { playerStore } from "./store";

export function initHotkeys() {
  const onKeyDown = (e: KeyboardEvent) => {
    // Медиаклавиши работают всегда
    if (e.code === "MediaPlayPause") return void togglePlay();
    if (e.code === "MediaTrackNext") return void next();
    if (e.code === "MediaTrackPrevious") return void prev();

    // В полях ввода (поиск) клавиши нужны для текста
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
      if (e.code === "Escape") target.blur();
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    const step = e.shiftKey ? 15_000 : 5_000;
    switch (e.code) {
      case "Space":
        e.preventDefault(); // иначе пробел ещё и «нажмёт» кнопку в фокусе
        if (!e.repeat) void togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        void seekBy(-step);
        break;
      case "ArrowRight":
        e.preventDefault();
        void seekBy(step);
        break;
      case "ArrowUp":
        e.preventDefault();
        void setVolume(playerStore.get().volume + 0.05);
        break;
      case "ArrowDown":
        e.preventDefault();
        void setVolume(playerStore.get().volume - 0.05);
        break;
      case "Escape":
        if (uiStore.get().nowPlayingOpen) setNowPlayingOpen(false);
        break;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
