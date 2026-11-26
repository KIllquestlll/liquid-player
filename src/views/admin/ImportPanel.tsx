// Админ-панель → «Добавить музыку»: выбор файлов/папок, перетаскивание, прогресс, итоги.
import { useMemo, type ReactNode } from "react";
import { FilePlusIcon, FolderIcon, LyricsIcon } from "../../components/icons";
import { plural } from "../../lib/format";
import type { ImportProgress, ImportSummary } from "../../lib/ipc";
import { describeImport, pickFiles, pickFolder, removeTracks, useLibrary } from "../../library/store";
import { cancelLyricsSearch, fetchMissingLyrics, useLyricsProgress } from "../../lyrics/store";
import { useUi } from "../../ui/store";

export function ImportPanel() {
  const importing = useLibrary((s) => s.importing);
  const lastImport = useLibrary((s) => s.lastImport);
  const tracks = useLibrary((s) => s.tracks);
  const dropHover = useUi((s) => s.dropHover);

  const stats = useMemo(
    () => ({
      noCover: tracks.filter((t) => !t.cover).length,
      missing: tracks.filter((t) => t.missing).map((t) => t.id),
    }),
    [tracks],
  );

  return (
    <div className="admin-import">
      <div className={`dropzone ${dropHover ? "is-hover" : ""}`}>
        <FolderIcon className="dropzone-icon" />
        <div className="dropzone-title">Перетащите файлы или папки в окно</div>
        <div className="muted">MP3 · FLAC · OGG · WAV · M4A — папки сканируются вместе с подпапками</div>
        <div className="dropzone-actions">
          <button className="pill-btn pill-btn--accent" onClick={() => void pickFiles()} disabled={!!importing}>
            <FilePlusIcon /> Выбрать файлы
          </button>
          <button className="pill-btn" onClick={() => void pickFolder()} disabled={!!importing}>
            <FolderIcon /> Выбрать папку
          </button>
        </div>
      </div>

      {importing && <ProgressCard progress={importing} />}
      {!importing && lastImport && <SummaryCard summary={lastImport} />}

      <div className="stats">
        <Stat value={tracks.length} label={plural(tracks.length, "песня в библиотеке", "песни в библиотеке", "песен в библиотеке")} />
        <Stat value={stats.noCover} label="без обложки" hint="Свою обложку можно будет поставить на этапе 4" />
        <Stat
          value={stats.missing.length}
          label="файл не найден"
          warn={stats.missing.length > 0}
          action={
            stats.missing.length > 0 && (
              <button className="link-btn" onClick={() => void removeTracks(stats.missing)}>
                Убрать из библиотеки
              </button>
            )
          }
        />
      </div>

      <LyricsCard />
    </div>
  );
}

/** Тексты песен по всей библиотеке: сколько есть, поиск недостающих. */
function LyricsCard() {
  const tracks = useLibrary((s) => s.tracks);
  const progress = useLyricsProgress();
  const counts = useMemo(() => {
    const c = { synced: 0, plain: 0, notFound: 0, none: 0 };
    for (const t of tracks) {
      if (t.lyrics === "synced") c.synced++;
      else if (t.lyrics === "plain") c.plain++;
      else if (t.lyrics === "notFound") c.notFound++;
      else if (t.lyrics === "none") c.none++;
    }
    return c;
  }, [tracks]);
  const missing = counts.none + counts.notFound;

  return (
    <div className="glass-card import-card">
      <div className="import-card-row">
        <strong>
          <LyricsIcon className="inline-icon" /> Тексты песен
        </strong>
        <span className="muted">
          с временем: {counts.synced} · без времени: {counts.plain} · не найдено: {counts.notFound} · не искали:{" "}
          {counts.none}
        </span>
      </div>

      {progress ? (
        <>
          <div className="import-card-row">
            <span>
              Поиск: {progress.done} из {progress.total} · найдено {progress.found}
            </span>
            <span className="muted import-current">{progress.current}</span>
          </div>
          <div className="meter">
            <div className="meter-fill" style={{ transform: `scaleX(${progress.total ? progress.done / progress.total : 0})` }} />
          </div>
          <button className="link-btn" onClick={() => void cancelLyricsSearch()}>
            Остановить
          </button>
        </>
      ) : (
        <div className="lyrics-card-actions">
          <button className="pill-btn" disabled={!missing} onClick={() => void fetchMissingLyrics()}>
            <LyricsIcon /> Найти недостающие тексты{missing ? ` (${missing})` : ""}
          </button>
          <span className="muted">
            Для новых песен текст ищется сам при добавлении. На lrclib.net отправляются только название, исполнитель,
            альбом и длительность.
          </span>
        </div>
      )}
    </div>
  );
}

function ProgressCard({ progress }: { progress: ImportProgress }) {
  const ratio = progress.total ? progress.done / progress.total : 0;
  return (
    <div className="glass-card import-card">
      <div className="import-card-row">
        <strong>{progress.total ? `Импорт: ${progress.done} из ${progress.total}` : "Ищу аудиофайлы…"}</strong>
        <span className="muted import-current">{progress.current}</span>
      </div>
      <div className={`meter ${progress.total ? "" : "is-indeterminate"}`}>
        <div className="meter-fill" style={{ transform: `scaleX(${ratio})` }} />
      </div>
    </div>
  );
}

function SummaryCard({ summary }: { summary: ImportSummary }) {
  return (
    <div className="glass-card import-card">
      <div className="import-card-row">
        <strong>Последний импорт</strong>
        <span className="muted">{describeImport(summary)}</span>
      </div>
      {summary.errors.length > 0 && (
        <ul className="import-errors">
          {summary.errors.slice(0, 8).map((e) => (
            <li key={e.path} title={e.path}>
              <span className="import-error-file">{e.path.split(/[\\/]/).pop()}</span>
              <span className="muted"> — {e.message}</span>
            </li>
          ))}
          {summary.errors.length > 8 && <li className="muted">и ещё {summary.errors.length - 8}…</li>}
        </ul>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  hint,
  warn,
  action,
}: {
  value: number;
  label: string;
  hint?: string;
  warn?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={`stat glass-card ${warn ? "stat--warn" : ""}`} title={hint}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {action}
    </div>
  );
}
