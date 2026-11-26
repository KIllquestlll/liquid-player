// Текст песни в полноэкранном плеере.
//   Синхронизированный: текущая строка крупная и яркая, остальные приглушены и
//   чуть размыты; список плавно едет к текущей строке; клик по строке — перемотка.
//   Колесо мыши — можно прокрутить и почитать, через 3 с список вернётся сам.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type WheelEvent } from "react";
import type { LyricsData, Track } from "../../lib/ipc";
import { fetchLyrics, lineAt, setLyricsOffset, useLyrics } from "../../lyrics/store";
import { positionNow, seekTo } from "../../player/controller";
import { usePlayer } from "../../player/store";
import { editTrack, setNowPlayingOpen } from "../../ui/store";
import { LyricsIcon } from "../icons";

export function LyricsView({ track }: { track?: Track }) {
  const lyrics = useLyrics(track?.id);

  if (!track) return <Message title="Ничего не играет" />;
  if (!lyrics) return <Message title="Загружаю текст…" />;

  switch (lyrics.status) {
    case "synced":
      return <SyncedLyrics key={track.id} data={lyrics} />;
    case "plain":
      return <PlainLyrics text={lyrics.plain ?? ""} />;
    case "instrumental":
      return <Message title="Инструментальная композиция" text="В этой песне нет слов." />;
    default:
      return (
        <Message
          title={lyrics.status === "notFound" ? "Текст не найден" : "Текста пока нет"}
          text="Можно поискать ещё раз или добавить текст вручную в Админ-панели."
        >
          <div className="lyrics-actions">
            {lyrics.status !== "cleared" && (
              <button className="pill-btn" onClick={() => void fetchLyrics(track.id)}>
                Найти на lrclib.net
              </button>
            )}
            <button
              className="pill-btn"
              onClick={() => {
                setNowPlayingOpen(false);
                editTrack(track.id, "lyrics");
              }}
            >
              Открыть в Админ-панели
            </button>
          </div>
        </Message>
      );
  }
}

function Message({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="lyrics-message">
      <LyricsIcon className="lyrics-message-icon" />
      <div className="lyrics-message-title">{title}</div>
      {text && <p className="muted">{text}</p>}
      {children}
    </div>
  );
}

function PlainLyrics({ text }: { text: string }) {
  return (
    <div className="lyrics-plain">
      <div className="lyrics-plain-note">Текст без синхронизации</div>
      {text.split("\n").map((line, i) => (
        <p key={i}>{line || " "}</p>
      ))}
    </div>
  );
}

function SyncedLyrics({ data }: { data: LyricsData }) {
  const { lines, offsetMs, hasWords, trackId } = data;
  const playing = usePlayer((s) => s.playing);
  const positionMs = usePlayer((s) => s.positionMs);
  const [active, setActive] = useState(-1);
  const [word, setWord] = useState(-1);

  // Какая строка/слово звучит сейчас. Вызывается каждый кадр, но React
  // перерисовывает список только когда номер строки или слова поменялся.
  const update = useCallback(() => {
    const t = positionNow() - offsetMs;
    const index = lineAt(lines, t);
    setActive(index);
    setWord(hasWords && index >= 0 ? lineAt(lines[index].words, t) : -1);
  }, [lines, offsetMs, hasWords]);

  useEffect(() => {
    if (!playing) return;
    let frame = requestAnimationFrame(function loop() {
      update();
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, update]);

  // На паузе кадры не крутим — обновляемся только при перемотке
  useEffect(() => {
    if (!playing) update();
  }, [playing, positionMs, update]);

  // ---------- прокрутка ----------
  const boxRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [shift, setShift] = useState(0);
  const [userShift, setUserShift] = useState(0);
  const userTimer = useRef(0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const el = lineRefs.current[Math.max(active, 0)];
    if (!box || !el) return;
    // текущая строка — на 38% высоты панели (как в Apple Music)
    setShift(el.offsetTop + el.offsetHeight / 2 - box.clientHeight * 0.38);
  }, [active, lines]);

  const onWheel = (e: WheelEvent) => {
    setUserShift((s) => s + e.deltaY);
    window.clearTimeout(userTimer.current);
    userTimer.current = window.setTimeout(() => setUserShift(0), 3000);
  };
  useEffect(() => () => window.clearTimeout(userTimer.current), []);

  const adjust = (delta: number) => setLyricsOffset(trackId, Math.round((offsetMs + delta) / 100) * 100);

  return (
    <div className="lyrics" ref={boxRef} onWheel={onWheel}>
      <div
        className={`lyrics-track ${userShift ? "is-free" : ""}`}
        style={{ transform: `translateY(${-(shift + userShift)}px)` }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            ref={(el) => {
              lineRefs.current[i] = el;
            }}
            className={`lyric-line ${i === active ? "is-active" : i < active ? "is-past" : ""}`}
            onClick={() => void seekTo(line.timeMs + offsetMs)}
          >
            {i === active && line.words.length > 0
              ? line.words.map((w, wi) => (
                  <span key={wi} className={wi <= word ? "is-sung" : ""}>
                    {w.text}
                  </span>
                ))
              : line.text || "♪"}
          </div>
        ))}
      </div>

      {/* Сдвиг синхронизации — появляется при наведении */}
      <div className="lyrics-offset" onWheel={(e) => e.stopPropagation()}>
        <button onClick={() => adjust(-100)} title="Текст раньше на 0,1 с">
          −0,1 с
        </button>
        <span title="Сдвиг текста: + позже, − раньше">
          {offsetMs === 0 ? "сдвиг 0" : `${offsetMs > 0 ? "+" : "−"}${(Math.abs(offsetMs) / 1000).toFixed(1).replace(".", ",")} с`}
        </span>
        <button onClick={() => adjust(100)} title="Текст позже на 0,1 с">
          +0,1 с
        </button>
      </div>
    </div>
  );
}
