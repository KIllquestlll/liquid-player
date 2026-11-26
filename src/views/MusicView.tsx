// Зона 2 — «Моя музыка»: список песен с поиском и сортировкой. Клик по строке — играть.
import { useMemo, useState } from "react";
import { DefaultRowActions, TrackRow } from "../components/TrackRow";
import { VirtualList } from "../components/VirtualList";
import { AdminIcon, MusicIcon, PlayIcon, ShuffleIcon, SortArrowIcon } from "../components/icons";
import { EmptyState, SearchField, Segmented } from "../components/ui";
import { formatTotal, normalize, plural } from "../lib/format";
import {
  DEFAULT_DIR,
  DIR_LABELS,
  loadSort,
  saveSort,
  SORT_LABELS,
  sortTracks,
  type SortKey,
  type SortState,
} from "../library/sort";
import { useLibrary } from "../library/store";
import { playAll, playTrack, useQueue } from "../player/queue";
import { usePlayer } from "../player/store";
import { navigate } from "../ui/store";

const ROW_HEIGHT = 60;

const SORT_OPTIONS = (Object.keys(SORT_LABELS) as SortKey[]).map((id) => ({ id, label: SORT_LABELS[id] }));

export function MusicView() {
  const tracks = useLibrary((s) => s.tracks);
  const loaded = useLibrary((s) => s.loaded);
  const currentId = useQueue((s) => s.currentId);
  const playing = usePlayer((s) => s.playing);
  const [query, setQuery] = useState("");
  const [sort, setSortState] = useState<SortState>(loadSort);

  const setSort = (next: SortState) => {
    setSortState(next);
    saveSort(next);
  };

  /** Клик по варианту: новый — включить с естественным направлением, тот же — перевернуть. */
  const chooseSort = (key: SortKey) =>
    setSort(key === sort.key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: DEFAULT_DIR[key] });

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const found = q
      ? tracks.filter((t) => normalize(`${t.title} ${t.artist ?? ""} ${t.album ?? ""}`).includes(q))
      : tracks;
    return sortTracks(found, sort);
  }, [tracks, query, sort]);

  // Очередь = то, что сейчас видно в списке (поиск + сортировка), без пропавших файлов
  const playableIds = useMemo(() => filtered.filter((t) => !t.missing).map((t) => t.id), [filtered]);
  const totalMs = useMemo(() => tracks.reduce((sum, t) => sum + (t.durationMs ?? 0), 0), [tracks]);

  if (loaded && tracks.length === 0) {
    return (
      <div className="view">
        <EmptyState
          icon={<MusicIcon />}
          title="В библиотеке пока пусто"
          text="Добавьте файлы или целую папку с музыкой в Админ-панели — песни появятся здесь."
          action={
            <button className="pill-btn pill-btn--accent" onClick={() => navigate("admin")}>
              <AdminIcon /> Открыть Админ-панель
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="view music-view">
      <header className="view-header">
        <div>
          <h1 className="view-title">Моя музыка</h1>
          <div className="view-subtitle">
            {tracks.length} {plural(tracks.length, "песня", "песни", "песен")} · {formatTotal(totalMs)}
          </div>
        </div>
        <div className="view-actions">
          <button className="pill-btn pill-btn--accent" disabled={!playableIds.length} onClick={() => void playAll(playableIds, { shuffle: false })}>
            <PlayIcon /> Слушать
          </button>
          <button className="pill-btn" disabled={!playableIds.length} onClick={() => void playAll(playableIds, { shuffle: true })}>
            <ShuffleIcon /> Перемешать
          </button>
        </div>
      </header>

      <div className="music-toolbar">
        <SearchField value={query} onChange={setQuery} placeholder="Найти песню или исполнителя" />
        <Segmented value={sort.key} options={SORT_OPTIONS} onChange={chooseSort} />
        <button
          className="pill-btn sort-dir"
          onClick={() => chooseSort(sort.key)}
          title="Поменять направление сортировки"
        >
          <SortArrowIcon className={sort.dir === "asc" ? "is-up" : ""} />
          {DIR_LABELS[sort.key][sort.dir]}
        </button>
      </div>

      <div className="track-table">
        <div className="track-head">
          <span className="col-index">#</span>
          <SortHeader label="Название" sortKey="title" sort={sort} onSort={chooseSort} />
          <span className="col-album">Альбом</span>
          <SortHeader label="Время" sortKey="duration" sort={sort} onSort={chooseSort} className="col-time" />
          <span />
        </div>
        {filtered.length > 0 ? (
          <VirtualList
            className="track-list"
            items={filtered}
            rowHeight={ROW_HEIGHT}
            getKey={(t) => t.id}
            renderRow={(t, i) => (
              <TrackRow
                track={t}
                index={i}
                current={t.id === currentId}
                playing={playing}
                onPlay={() => void playTrack(t.id, playableIds)}
                actions={<DefaultRowActions track={t} />}
              />
            )}
          />
        ) : (
          <div className="list-empty muted">Ничего не найдено по запросу «{query}»</div>
        )}
      </div>
    </div>
  );
}

/** Заголовок колонки, по которому можно кликнуть для сортировки. */
function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <button className={`sort-header ${active ? "is-active" : ""} ${className}`} onClick={() => onSort(sortKey)}>
      {label}
      {active && <SortArrowIcon className={sort.dir === "asc" ? "is-up" : ""} />}
    </button>
  );
}

