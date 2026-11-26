import { useRef } from "react";
import { setVolume } from "../player/controller";
import { usePlayer } from "../player/store";
import { GlassSlider } from "./GlassSlider";
import { VolumeIcon } from "./icons";

export function VolumeControl() {
  const volume = usePlayer((s) => s.volume);
  // Громкость до выключения звука — чтобы вернуть её повторным кликом
  const beforeMute = useRef(0.8);

  const toggleMute = () => {
    if (volume > 0) {
      beforeMute.current = volume;
      void setVolume(0);
    } else {
      void setVolume(beforeMute.current || 0.8);
    }
  };

  return (
    <div className="volume">
      <button
        className="icon-btn icon-btn--small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggleMute}
        aria-label={volume > 0 ? "Выключить звук" : "Включить звук"}
      >
        <VolumeIcon level={volume} />
      </button>
      <GlassSlider label="Громкость" value={volume} onChange={(v) => void setVolume(v)} />
    </div>
  );
}
