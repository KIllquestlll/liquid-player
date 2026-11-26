// Обложка трека. Если картинки нет — красивый градиент, цвет которого
// зависит от id трека (у каждой песни свой, и он не меняется).
import { useState } from "react";
import { fileUrl } from "../lib/ipc";

interface Props {
  src?: string | null;
  /** id трека — для цвета заглушки */
  seed?: string | null;
  className?: string;
}

export function Cover({ src, seed, className = "" }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src && src !== failedSrc;

  return (
    <div className={`cover ${className}`} style={showImage ? undefined : placeholderStyle(seed)}>
      {showImage ? (
        <img
          src={fileUrl(src)}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span className="cover-note" aria-hidden>
          ♫
        </span>
      )}
    </div>
  );
}

function placeholderStyle(seed?: string | null) {
  let hash = 0;
  for (const ch of seed ?? "liquid") hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue} 75% 62%), hsl(${(hue + 50) % 360} 70% 42%))`,
  };
}
