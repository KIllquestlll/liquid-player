// Фон на весь экран по настройкам текущей песни:
//   свой фон или размытая обложка + размытие (0–60 px) + затемнение (0–100%).
// При смене песни новый слой плавно проявляется поверх старого (кроссфейд).
import { useEffect, useRef, useState } from "react";
import { backdropSource, DEFAULT_BLUR, DEFAULT_DIM } from "../../library/appearance";
import { fileUrl, type Track } from "../../lib/ipc";
import { useCurrentTrack } from "../../player/queue";

/** Фон приложения и полноэкранного плеера — по текущей песне. */
export function Backdrop({ className = "" }: { className?: string }) {
  const track = useCurrentTrack();
  return <BackdropView track={track} className={className} />;
}

interface Layer {
  key: number;
  src: string | null;
  /** свой фон показываем как есть, обложке добавляем насыщенности */
  custom: boolean;
  blur: number;
}

/**
 * Сам фон для любого трека. `scale` — во сколько раз картинка меньше окна
 * (превью в редакторе): размытие уменьшаем пропорционально, чтобы превью
 * выглядело так же, как настоящий фон.
 */
export function BackdropView({ track, scale = 1, className = "" }: { track?: Track; scale?: number; className?: string }) {
  const { src, custom } = backdropSource(track);
  const blur = track?.blur ?? DEFAULT_BLUR;
  const dim = track?.dim ?? DEFAULT_DIM;

  // Максимум два слоя: старый (уходит) и новый (проявляется поверх)
  const [layers, setLayers] = useState<Layer[]>(() => [{ key: 0, src, custom, blur }]);
  // Настройки предыдущей отрисовки — уходящий слой «замораживается» с ними
  const previous = useRef({ blur, custom });

  useEffect(() => {
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top.src === src) return prev;
      const leaving = { ...top, ...previous.current };
      return [leaving, { key: Date.now(), src, custom, blur }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- новый слой нужен только при смене картинки
  }, [src]);

  useEffect(() => {
    previous.current = { blur, custom };
  });

  return (
    <div className={`backdrop ${className}`} aria-hidden>
      {layers.map((layer, i) => {
        const isTop = i === layers.length - 1;
        const layerBlur = (isTop ? blur : layer.blur) * scale;
        const layerCustom = isTop ? custom : layer.custom;
        return (
          <div
            key={layer.key}
            className={`backdrop-layer ${layer.src ? "has-image" : ""}`}
            style={
              layer.src
                ? {
                    backgroundImage: `url("${fileUrl(layer.src)}")`,
                    filter: filterFor(layerBlur, layerCustom),
                    // слой шире экрана на размер размытия — иначе по краям видна светлая рамка
                    inset: `${-Math.ceil(layerBlur * 2)}px`,
                  }
                : undefined
            }
          />
        );
      })}
      <div className="backdrop-shade" style={{ opacity: dim }} />
    </div>
  );
}

function filterFor(blur: number, custom: boolean): string | undefined {
  const parts: string[] = [];
  if (blur > 0.1) parts.push(`blur(${blur.toFixed(1)}px)`);
  if (!custom) parts.push("saturate(1.4)");
  return parts.length ? parts.join(" ") : undefined;
}
