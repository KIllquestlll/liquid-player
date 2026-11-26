// Полноэкранный плеер: крупная обложка и управление слева, текст песни справа.
// Открывается кликом по нижней панели или кнопкой «Текст», закрывается кнопкой или Esc.
import { fileFormat } from "../../lib/format";
import { useCurrentTrack } from "../../player/queue";
import { usePlayer } from "../../player/store";
import { setNowPlayingOpen, useUi } from "../../ui/store";
import { Cover } from "../Cover";
import { LyricsView } from "../lyrics/LyricsView";
import { ProgressBar } from "../ProgressBar";
import { Transport } from "../Transport";
import { VolumeControl } from "../VolumeControl";
import { ChevronDownIcon } from "../icons";
import { Backdrop } from "./Backdrop";

export function NowPlayingOverlay() {
  const open = useUi((s) => s.nowPlayingOpen);
  const track = useCurrentTrack();
  const playing = usePlayer((s) => s.playing);

  return (
    <div className={`now-playing ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <Backdrop className="backdrop--immersive" />

      <button className="now-playing-close icon-btn icon-btn--small" onClick={() => setNowPlayingOpen(false)} aria-label="Свернуть">
        <ChevronDownIcon />
      </button>

      <div className="now-playing-body">
        <section className="np-player">
          {/* Большую обложку грузим только когда плеер открыт — экономим память */}
          <Cover
            src={open ? track?.cover : track?.coverSmall}
            seed={track?.id}
            className={`np-cover ${track && !playing ? "is-paused" : ""}`}
          />
          <div className="np-meta">
            <div className="np-title">{track?.title ?? "Ничего не играет"}</div>
            <div className="np-artist">
              {[track?.artist, track?.album].filter(Boolean).join(" — ") || (track ? fileFormat(track.path) : "")}
            </div>
          </div>
          <div className="np-controls">
            <ProgressBar />
            <Transport />
            <VolumeControl />
          </div>
        </section>

        {/* Текст рисуем только когда плеер открыт: подсветка обновляется каждый кадр,
            и в свёрнутом виде этой работе незачем тратить процессор */}
        <section className="np-lyrics">{open && <LyricsView track={track} />}</section>
      </div>
    </div>
  );
}
