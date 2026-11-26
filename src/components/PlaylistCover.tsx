// Обложка плейлиста: мозаика 2×2 из обложек первых песен.
// Если разных обложек меньше четырёх — первая обложка (или цветная заглушка).
import type { Playlist } from "../lib/ipc";
import { fileUrl } from "../lib/ipc";
import { useLibrary } from "../library/store";
import { Cover } from "./Cover";

export function PlaylistCover({ playlist, className = "" }: { playlist: Playlist; className?: string }) {
  const byId = useLibrary((s) => s.byId);
  const covers: string[] = [];
  for (const id of playlist.trackIds) {
    const src = byId.get(id)?.coverSmall;
    if (src && !covers.includes(src)) covers.push(src);
    if (covers.length === 4) break;
  }

  if (covers.length < 4) {
    return <Cover src={covers[0]} seed={`playlist-${playlist.id}-${playlist.name}`} className={className} />;
  }
  return (
    <div className={`cover playlist-mosaic ${className}`}>
      {covers.map((src) => (
        <img key={src} src={fileUrl(src)} alt="" draggable={false} loading="lazy" decoding="async" />
      ))}
    </div>
  );
}
