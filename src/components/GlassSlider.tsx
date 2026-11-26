// Стеклянный ползунок: используется и для прогресса, и для громкости.
// Двигается только через transform (scaleX / translateX) — это дёшево для процессора.
import { useRef, useState, type PointerEvent } from "react";
import { clamp } from "../lib/format";

interface Props {
  /** Текущее значение 0..1 */
  value: number;
  /** Во время перетаскивания (каждое движение мыши) */
  onChange?: (value: number) => void;
  /** Кнопку мыши отпустили — финальное значение */
  onCommit?: (value: number) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}

export function GlassSlider({ value, onChange, onCommit, disabled, label, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Пока тянем — показываем позицию мыши, а не значение снаружи
  const [dragValue, setDragValue] = useState<number | null>(null);
  const shown = clamp(dragValue ?? value);

  const valueAt = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return clamp((clientX - rect.left) / rect.width);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    // «Захват» указателя: движения мыши приходят сюда, даже если она ушла за пределы ползунка
    e.currentTarget.setPointerCapture(e.pointerId);
    const v = valueAt(e.clientX);
    setDragValue(v);
    onChange?.(v);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragValue === null) return;
    const v = valueAt(e.clientX);
    setDragValue(v);
    onChange?.(v);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragValue === null) return;
    const v = valueAt(e.clientX);
    setDragValue(null);
    onCommit?.(v);
  };

  return (
    <div
      ref={ref}
      className={`slider ${dragValue !== null ? "is-dragging" : ""} ${className}`}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      aria-disabled={disabled || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDragValue(null)}
    >
      <div className="slider-track">
        <div className="slider-fill" style={{ transform: `scaleX(${shown})` }} />
      </div>
      {/* «Рельс» во всю ширину сдвигается на value×100% — так кружок едет без пересчёта раскладки.
          Обёртка обрезает уехавший за край рельс, иначе у панели появлялась бы лишняя прокрутка. */}
      <div className="slider-thumb-clip">
        <div className="slider-rail" style={{ transform: `translateX(${shown * 100}%)` }}>
          <div className="slider-thumb" />
        </div>
      </div>
    </div>
  );
}
