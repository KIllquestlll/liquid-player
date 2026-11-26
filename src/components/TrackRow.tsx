// Строка песни в списке: номер/эквалайзер, обложка, название, альбом, время, кнопки.
// Используется в «Моей музыке» и в плейлистах.
import type { MouseEvent, ReactNode } from "react";
import { formatTime } from "../lib/format";
import type { Track } from "../lib/ipc";
import { editTrack, openPlaylistMenu } from "../ui/store";
import { Cover } from "./Cover";
import { PencilIcon, PlayIcon, PlusIcon } from "./icons";
import { Equalizer } from "./ui";

export function TrackRow({
  track,
  index,
  current,
  playing,
  onPlay,
  actions,
}: {
  track: Track;
  index: number;
  current: boolean;
  playing: boolean;
  onPlay: () => void;
  /** Кнопки справа (появляются при наведении) */
  actions: ReactNode;
}) {
  return (
    <div
      className={`track-row ${current ? "is-current" : ""} ${track.missing ? "is-missing" : ""}`}
      onClick={() => !track.missing && onPlay()}
      title={track.missing ? `Файл не найден: ${track.path}` : undefined}
    >
      <span className="col-index">
        {current ? (
          <Equalizer active={playing} />
        ) : (
          <>
            <span className="index-num">{index + 1}</span>
            <PlayIcon className="index-play" />
          </>
        )}
      </span>
      <div className="col-title">
        <Cover src={track.coverSmall} seed={track.id} className="row-cover" />
        <div className="row-text">
          <div className="row-title">{track.title}</div>
          <div className="row-artist">
            {track.missing ? <span className="chip chip--warn">файл не найден</span> : (track.artist ?? "Неизвестный исполнитель")}
          </div>
        </div>
      </div>
      <span className="col-album">{track.album ?? ""}</span>
      <span className="col-time">{track.durationMs ? formatTime(track.durationMs) : ""}</span>
      <span className="col-actions">{actions}</span>
    </div>
  );
}

/** Маленькая кнопка в строке: клик не включает песню. */
export function RowButton({
  title,
  onClick,
  children,
  disabled,
}: {
  title: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon-btn icon-btn--tiny"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

/** «+» — добавить в плейлист, «карандаш» — открыть в Админ-панели. */
export function DefaultRowActions({ track }: { track: Track }) {
  return (
    <>
      <RowButton title="Добавить в плейлист" onClick={(e) => openPlaylistMenu([track.id], e.currentTarget)}>
        <PlusIcon />
      </RowButton>
      <RowButton title="Изменить в Админ-панели" onClick={() => editTrack(track.id)}>
        <PencilIcon />
      </RowButton>
    </>
  );
}
