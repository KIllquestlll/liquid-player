// Нижняя панель плеера — видна во всех зонах.
// Клик по обложке/названию открывает полноэкранный плеер.
import { useCurrentTrack } from "../../player/queue";
import { setNowPlayingOpen } from "../../ui/store";
import { Cover } from "../Cover";
import { ProgressBar } from "../ProgressBar";
import { Transport } from "../Transport";
import { VolumeControl } from "../VolumeControl";
import { openPlaylistMenu } from "../../ui/store";
import { ExpandIcon, LyricsIcon, PlusIcon } from "../icons";

export function PlayerBar() {
  const track = useCurrentTrack();

  return (
    <footer className="player-bar glass">
      <button
        className="bar-track"
        onClick={() => setNowPlayingOpen(true)}
        disabled={!track}
        title={track ? "Открыть плеер на весь экран" : undefined}
      >
        <Cover src={track?.coverSmall} seed={track?.id} className="bar-cover" />
        <div className="bar-meta">
          <div className="bar-title">{track?.title ?? "Ничего не играет"}</div>
          <div className="bar-artist">{track ? (track.artist ?? "Неизвестный исполнитель") : "Выберите песню в «Моей музыке»"}</div>
        </div>
      </button>

      <div className="bar-center">
        <Transport size="compact" />
        <ProgressBar layout="inline" />
      </div>

      <div className="bar-right">
        <VolumeControl />
        <button
          className="icon-btn icon-btn--small"
          onClick={(e) => track && openPlaylistMenu([track.id], e.currentTarget)}
          disabled={!track}
          aria-label="Добавить в плейлист"
          title="Добавить в плейлист"
        >
          <PlusIcon />
        </button>
        {/* «Текст» открывает полноэкранный плеер, где справа идёт текст песни */}
        <button
          className={`icon-btn icon-btn--small lyrics-btn ${track && ["synced", "plain"].includes(track.lyrics) ? "has-lyrics" : ""}`}
          onClick={() => setNowPlayingOpen(true)}
          disabled={!track}
          aria-label="Текст песни"
          title={track?.lyrics === "synced" ? "Текст песни (синхронизированный)" : "Текст песни"}
        >
          <LyricsIcon />
        </button>
        <button
          className="icon-btn icon-btn--small"
          onClick={() => setNowPlayingOpen(true)}
          disabled={!track}
          aria-label="Полноэкранный плеер"
          title="Полноэкранный плеер"
        >
          <ExpandIcon />
        </button>
      </div>
    </footer>
  );
}
