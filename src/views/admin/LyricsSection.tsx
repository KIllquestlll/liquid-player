// Админ-панель → редактор трека → «Текст песни».
// Режимы: просмотр | поиск на lrclib.net | редактирование | ручная разметка.
import { useEffect, useMemo, useRef, useState } from "react";
import { LyricsIcon, SearchIcon } from "../../components/icons";
import { formatTime } from "../../lib/format";
import { lyricsApi, type LyricsCandidate, type LyricsData, type Track } from "../../lib/ipc";
import { libraryStore } from "../../library/store";
import {
  applyCandidate,
  clearLyrics,
  fetchLyrics,
  importLyricsFile,
  lrcTime,
  saveLyrics,
  setLyricsOffset,
  useLyrics,
} from "../../lyrics/store";
import { playPause, positionNow, seekTo } from "../../player/controller";
import { playTrack, useQueue } from "../../player/queue";
import { usePlayer } from "../../player/store";
import { showError } from "../../ui/store";

type Mode = "view" | "search" | "edit" | "tap";

const STATUS_LABEL: Record<string, string> = {
  synced: "синхронизирован",
  plain: "без времени",
  instrumental: "инструментал",
  notFound: "не найден",
  cleared: "удалён",
  none: "не искали",
};

const SOURCE_LABEL: Record<string, string> = {
  lrclib: "с lrclib.net",
  file: "из файла",
  manual: "ручная разметка",
  edited: "изменён вручную",
};

export function LyricsSection({ track }: { track: Track }) {
  const lyrics = useLyrics(track.id);
  const [mode, setMode] = useState<Mode>("view");
  const back = () => setMode("view");

  return (
    <section id="section-lyrics" className="editor-section glass-card editor-section--full lyrics-section">
      <header className="section-head">
        <span className="section-icon">
          <LyricsIcon />
        </span>
        <h3>Текст песни</h3>
        <div className="chips section-chips">
          {lyrics?.source && ["synced", "plain"].includes(lyrics.status) && (
            <span className="chip">{SOURCE_LABEL[lyrics.source] ?? lyrics.source}</span>
          )}
          <span className={`chip ${lyrics?.status === "notFound" ? "chip--warn" : ""}`}>
            {STATUS_LABEL[lyrics?.status ?? track.lyrics]}
          </span>
        </div>
      </header>

      {!lyrics ? (
        <p className="muted">Загружаю…</p>
      ) : mode === "search" ? (
        <LyricsSearch track={track} onDone={back} />
      ) : mode === "edit" ? (
        <LyricsTextEditor track={track} lyrics={lyrics} onDone={back} />
      ) : mode === "tap" ? (
        <ManualSync track={track} lyrics={lyrics} onDone={back} onNeedText={() => setMode("edit")} />
      ) : (
        <LyricsOverview track={track} lyrics={lyrics} setMode={setMode} />
      )}
    </section>
  );
}

// ---------- Просмотр ----------

function LyricsOverview({ track, lyrics, setMode }: { track: Track; lyrics: LyricsData; setMode: (m: Mode) => void }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const hasText = lyrics.status === "synced" || lyrics.status === "plain";
  const adjust = (delta: number) => setLyricsOffset(track.id, Math.round((lyrics.offsetMs + delta) / 100) * 100);

  return (
    <div className="section-body">
      <div className="lyrics-preview">
        {lyrics.status === "synced" ? (
          lyrics.lines.map((line, i) => (
            <div key={i} className="lyrics-preview-line">
              <span className="lyrics-preview-time">{formatTime(line.timeMs)}</span>
              <span>{line.text || "♪"}</span>
            </div>
          ))
        ) : lyrics.status === "plain" ? (
          <div className="lyrics-preview-plain">{lyrics.plain}</div>
        ) : (
          <div className="lyrics-preview-empty muted">
            {lyrics.status === "notFound"
              ? "На lrclib.net текст не нашёлся. Проверьте название и исполнителя (их можно исправить выше) и поищите снова, загрузите .lrc или вставьте текст и разметьте его."
              : lyrics.status === "instrumental"
                ? "lrclib.net считает песню инструментальной. Если это не так — найдите текст вручную."
                : lyrics.status === "cleared"
                  ? "Текст удалён. Автопоиск его не вернёт — найдите или добавьте вручную."
                  : "Текст ещё не искали."}
          </div>
        )}
      </div>

      <div className="section-actions">
        {!hasText && lyrics.status !== "cleared" && (
          <button className="pill-btn pill-btn--accent" onClick={() => void fetchLyrics(track.id)}>
            Найти автоматически
          </button>
        )}
        <button className="pill-btn" onClick={() => setMode("search")}>
          <SearchIcon /> Найти на lrclib.net
        </button>
        <button className="pill-btn" onClick={() => void importLyricsFile(track.id)}>
          Загрузить .lrc / .txt
        </button>
        <button className="pill-btn" onClick={() => setMode("edit")}>
          {hasText ? "Редактировать текст" : "Вставить текст"}
        </button>
        <button
          className="pill-btn"
          onClick={() => setMode("tap")}
          disabled={!lyrics.plain}
          title={lyrics.plain ? "Слушать песню и отмечать начало каждой строки" : "Сначала вставьте или найдите текст"}
        >
          Разметить вручную
        </button>
        {hasText &&
          (confirmClear ? (
            <>
              <button className="pill-btn pill-btn--danger" onClick={() => void clearLyrics(track.id).then(() => setConfirmClear(false))}>
                Да, удалить
              </button>
              <button className="pill-btn" onClick={() => setConfirmClear(false)}>
                Отмена
              </button>
            </>
          ) : (
            <button className="pill-btn" onClick={() => setConfirmClear(true)}>
              Удалить текст
            </button>
          ))}
      </div>

      {lyrics.status === "synced" && (
        <div className="offset-row">
          <span>Сдвиг синхронизации</span>
          <button className="pill-btn" onClick={() => adjust(-100)} title="Текст будет появляться раньше">
            −0,1 с
          </button>
          <span className="offset-value">
            {lyrics.offsetMs === 0 ? "0,0 с" : `${lyrics.offsetMs > 0 ? "+" : "−"}${(Math.abs(lyrics.offsetMs) / 1000).toFixed(1).replace(".", ",")} с`}
          </span>
          <button className="pill-btn" onClick={() => adjust(100)} title="Текст будет появляться позже">
            +0,1 с
          </button>
          {lyrics.offsetMs !== 0 && (
            <button className="link-btn" onClick={() => setLyricsOffset(track.id, 0)}>
              сбросить
            </button>
          )}
          <span className="muted offset-hint">«+» — текст позже, «−» — раньше</span>
        </div>
      )}
    </div>
  );
}

// ---------- Поиск на lrclib.net ----------

function LyricsSearch({ track, onDone }: { track: Track; onDone: () => void }) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist ?? "");
  const [results, setResults] = useState<LyricsCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState<number | null>(null);

  const search = async () => {
    setBusy(true);
    try {
      setResults(await lyricsApi.search(title, artist));
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  // Сразу ищем по текущим названию и исполнителю
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void search(), []);

  const choose = async (c: LyricsCandidate) => {
    setApplying(c.id);
    if (await applyCandidate(track.id, c.id)) onDone();
    setApplying(null);
  };

  return (
    <div className="section-body">
      <form
        className="lyrics-search-form"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название" />
        <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Исполнитель" />
        <button className="pill-btn pill-btn--accent" type="submit" disabled={busy}>
          {busy ? "Ищу…" : "Искать"}
        </button>
        <button className="pill-btn" type="button" onClick={onDone}>
          Отмена
        </button>
      </form>

      {results && results.length === 0 && !busy && (
        <p className="muted">Ничего не нашлось. Попробуйте изменить название или исполнителя.</p>
      )}
      {results && results.length > 0 && (
        <div className="candidates">
          {results.map((c) => {
            const diff = track.durationMs && c.durationMs ? Math.abs(track.durationMs - c.durationMs) / 1000 : null;
            return (
              <div key={c.id} className="candidate">
                <div className="candidate-info">
                  <div className="candidate-title">
                    {c.trackName} <span className="muted">— {c.artistName}</span>
                  </div>
                  <div className="chips">
                    {c.albumName && <span className="chip">{c.albumName}</span>}
                    {c.durationMs !== null && <span className="chip">{formatTime(c.durationMs)}</span>}
                    {diff !== null && (
                      <span className={`chip ${diff <= 2 ? "chip--ok" : "chip--warn"}`}>
                        {diff <= 2 ? "длительность совпадает" : `разница ${Math.round(diff)} с`}
                      </span>
                    )}
                    {c.synced && <span className="chip chip--ok">с временем</span>}
                    {!c.synced && c.plain && <span className="chip">без времени</span>}
                    {c.instrumental && <span className="chip">инструментал</span>}
                  </div>
                  {c.preview && <div className="candidate-preview muted">{c.preview}</div>}
                </div>
                <button className="pill-btn" disabled={applying !== null} onClick={() => void choose(c)}>
                  {applying === c.id ? "Беру…" : "Выбрать"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Редактирование ----------

function LyricsTextEditor({ track, lyrics, onDone }: { track: Track; lyrics: LyricsData; onDone: () => void }) {
  const [text, setText] = useState(lyrics.raw ?? lyrics.plain ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    if (await saveLyrics(track.id, text, "edited")) onDone();
    setSaving(false);
  };

  return (
    <div className="section-body">
      <p className="section-text muted">
        Строки вида <code>[01:23.45]Текст</code> сохранятся как синхронизированный текст. Без меток времени — как обычный
        (его потом можно разметить вручную).
      </p>
      <textarea
        className="lyrics-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        rows={14}
        placeholder="Вставьте текст песни — каждая строка с новой строки"
      />
      <div className="section-actions">
        <button className="pill-btn pill-btn--accent" onClick={() => void save()} disabled={saving || !text.trim()}>
          {saving ? "Сохраняю…" : "Сохранить"}
        </button>
        <button className="pill-btn" onClick={onDone}>
          Отмена
        </button>
      </div>
    </div>
  );
}

// ---------- Ручная разметка ----------

function ManualSync({
  track,
  lyrics,
  onDone,
  onNeedText,
}: {
  track: Track;
  lyrics: LyricsData;
  onDone: () => void;
  onNeedText: () => void;
}) {
  const lines = useMemo(
    () => (lyrics.plain ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
    [lyrics.plain],
  );
  const [stamps, setStamps] = useState<number[]>([]);
  const [started, setStarted] = useState(false);
  const [saving, setSaving] = useState(false);
  const isCurrent = useQueue((s) => s.currentId === track.id);
  const playing = usePlayer((s) => s.playing);
  const listRef = useRef<HTMLDivElement>(null);
  const done = stamps.length >= lines.length;

  const start = async () => {
    setStamps([]);
    setStarted(true);
    if (isCurrent) {
      await seekTo(0);
      if (!playing) await playPause();
    } else {
      const ids = libraryStore.get().tracks.filter((t) => !t.missing).map((t) => t.id);
      await playTrack(track.id, ids);
    }
  };

  const mark = () => {
    if (!started || done) return;
    setStamps((s) => (s.length < lines.length ? [...s, Math.round(positionNow())] : s));
  };
  const undo = () => setStamps((s) => s.slice(0, -1));

  // Enter — отметить строку, Backspace — отменить последнюю метку
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        if (!e.repeat) mark();
      } else if (e.code === "Backspace") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Текущая строка всегда видна
  useEffect(() => {
    listRef.current?.querySelector(".is-next")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [stamps.length]);

  const save = async () => {
    setSaving(true);
    const lrc = stamps.map((t, i) => `[${lrcTime(t)}]${lines[i]}`).join("\n");
    if (await saveLyrics(track.id, lrc, "manual")) onDone();
    setSaving(false);
  };

  if (lines.length === 0) {
    return (
      <div className="section-body">
        <p className="muted">Для разметки нужен текст без времени. Вставьте его — потом вернитесь сюда.</p>
        <div className="section-actions">
          <button className="pill-btn pill-btn--accent" onClick={onNeedText}>
            Вставить текст
          </button>
          <button className="pill-btn" onClick={onDone}>
            Отмена
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="section-body">
      <p className="section-text muted">
        Нажмите «Старт» — песня начнётся сначала. В момент, когда начинается очередная строка, нажимайте{" "}
        <kbd>Enter</kbd> (или кнопку «Отметить»). <kbd>Backspace</kbd> — отменить последнюю метку, <kbd>Пробел</kbd> —
        пауза, <kbd>←</kbd> — назад на 5 с.
      </p>

      <div className="tap-controls">
        <button className="pill-btn" onClick={() => void start()}>
          {started ? "Начать заново" : "Старт"}
        </button>
        <button className="pill-btn pill-btn--accent tap-mark" onClick={mark} disabled={!started || done}>
          Отметить строку ⏎
        </button>
        <button className="pill-btn" onClick={undo} disabled={!stamps.length}>
          Отменить
        </button>
        <span className="muted tap-count">
          {stamps.length} из {lines.length}
        </span>
        {started && !isCurrent && <span className="chip chip--warn">играет другая песня</span>}
      </div>

      <div className="tap-list" ref={listRef}>
        {lines.map((line, i) => (
          <div key={i} className={`tap-line ${i < stamps.length ? "is-done" : i === stamps.length ? "is-next" : ""}`}>
            <span className="tap-time">{i < stamps.length ? lrcTime(stamps[i]) : "—"}</span>
            <span>{line}</span>
          </div>
        ))}
      </div>

      <div className="section-actions">
        <button className="pill-btn pill-btn--accent" onClick={() => void save()} disabled={!stamps.length || saving}>
          {saving ? "Сохраняю…" : done ? "Сохранить разметку" : `Сохранить отмеченные (${stamps.length} из ${lines.length})`}
        </button>
        <button className="pill-btn" onClick={onDone}>
          Отмена
        </button>
      </div>
    </div>
  );
}
