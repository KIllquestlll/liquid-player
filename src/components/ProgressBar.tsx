import { useState } from "react";
import { clamp, formatTime } from "../lib/format";
import { seekTo } from "../player/controller";
import { usePlayer } from "../player/store";
import { GlassSlider } from "./GlassSlider";

/**
 * inline  — время слева и справа от полоски (нижняя панель плеера)
 * stacked — время под полоской (полноэкранный плеер)
 */
export function ProgressBar({ layout = "stacked" }: { layout?: "inline" | "stacked" }) {
  // Компонент перерисовывается ~20 раз в секунду — поэтому он маленький и отдельный
  const positionMs = usePlayer((s) => s.positionMs);
  const durationMs = usePlayer((s) => s.durationMs);
  const [preview, setPreview] = useState<number | null>(null);

  const total = durationMs ?? 0;
  const ratio = total > 0 ? clamp(positionMs / total) : 0;
  const shownMs = preview !== null ? preview * total : positionMs;
  const elapsed = formatTime(shownMs);
  const remaining = total > 0 ? `−${formatTime(total - shownMs)}` : "–:––";

  const slider = (
    <GlassSlider
      label="Позиция воспроизведения"
      value={ratio}
      disabled={total === 0}
      onChange={setPreview}
      onCommit={(v) => {
        setPreview(null);
        void seekTo(v * total);
      }}
    />
  );

  return layout === "inline" ? (
    <div className="progress progress--inline">
      <span className="progress-time">{elapsed}</span>
      {slider}
      <span className="progress-time">{remaining}</span>
    </div>
  ) : (
    <div className="progress">
      {slider}
      <div className="progress-times">
        <span>{elapsed}</span>
        <span>{remaining}</span>
      </div>
    </div>
  );
}
