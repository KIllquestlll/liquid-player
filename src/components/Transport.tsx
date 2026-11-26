import type { MouseEvent } from "react";
import { cycleRepeat, next, prev, toggleShuffle, togglePlay, useQueue } from "../player/queue";
import { usePlayer } from "../player/store";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon, RepeatIcon, ShuffleIcon } from "./icons";

// Кнопки не забирают фокус при клике мышью — иначе пробел «нажимал» бы их повторно
const keepFocus = (e: MouseEvent) => e.preventDefault();

const REPEAT_LABEL = { off: "Повтор выключен", all: "Повтор списка", one: "Повтор трека" };

export function Transport({ size = "large" }: { size?: "compact" | "large" }) {
  const playing = usePlayer((s) => s.playing);
  const shuffle = useQueue((s) => s.shuffle);
  const repeat = useQueue((s) => s.repeat);
  const hasQueue = useQueue((s) => s.order.length > 0);

  return (
    <div className={`transport transport--${size}`}>
      <button
        className={`icon-btn icon-btn--toggle ${shuffle ? "is-on" : ""}`}
        onMouseDown={keepFocus}
        onClick={toggleShuffle}
        aria-label={shuffle ? "Перемешивание включено" : "Перемешивание выключено"}
        title="Перемешать"
      >
        <ShuffleIcon />
      </button>

      <button className="icon-btn" onMouseDown={keepFocus} onClick={() => void prev()} disabled={!hasQueue} aria-label="Предыдущий трек">
        <PrevIcon />
      </button>

      <button
        className="icon-btn icon-btn--primary"
        onMouseDown={keepFocus}
        onClick={() => void togglePlay()}
        aria-label={playing ? "Пауза" : "Воспроизвести"}
      >
        {/* Обе иконки лежат друг на друге и плавно меняются местами */}
        <span className={`swap ${playing ? "swap--b" : "swap--a"}`}>
          <PlayIcon className="swap-a" />
          <PauseIcon className="swap-b" />
        </span>
      </button>

      <button className="icon-btn" onMouseDown={keepFocus} onClick={() => void next()} disabled={!hasQueue} aria-label="Следующий трек">
        <NextIcon />
      </button>

      <button
        className={`icon-btn icon-btn--toggle ${repeat !== "off" ? "is-on" : ""}`}
        onMouseDown={keepFocus}
        onClick={cycleRepeat}
        aria-label={REPEAT_LABEL[repeat]}
        title={REPEAT_LABEL[repeat]}
      >
        <RepeatIcon one={repeat === "one"} />
      </button>
    </div>
  );
}
