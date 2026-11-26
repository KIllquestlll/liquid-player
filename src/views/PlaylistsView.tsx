// Зона «Плейлисты»: слева список плейлистов, справа выбранный плейлист.
import { useMemo, useState } from "react";
import { PlaylistCover } from "../components/PlaylistCover";
import { RowButton, TrackRow } from "../components/TrackRow";
import { VirtualList } from "../components/VirtualList";
import { Cover } from "../components/Cover";
import { CloseIcon, PencilIcon, PlayIcon, PlaylistIcon, PlusIcon, ShuffleIcon, SortArrowIcon, TrashIcon } from "../components/icons";
import { EmptyState, SearchField } from "../components/ui";
import { formatTotal, normalize, plural } from "../lib/format";
import type { Playlist, Track } from "../lib/ipc";
import { useLibrary } from "../library/store";
import { playAll, playTrack, useQueue } from "../player/queue";
import { usePlayer } from "../player/store";
import {
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  moveInPlaylist,
  removeFromPlaylist,
  renamePlaylist,
  usePlaylists,
} from "../playlists/store";
import { uiStore, useUi } from "../ui/store";

const songs = (n: number) => `${n} ${plural(n, "песня", "песни", "песен")}`;

export function PlaylistsView() {
  const playlists = usePlaylists((s) => s.playlists);
  const openId = useUi((s) => s.openPlaylistId);
  const [creating, setCreating] = useState(false);
  const selected = playlists.find((p) => p.id === openId) ?? playlists[0];

  return (
    <div className="view playlists-view">
      <header className="view-header">
        <div>
          <h1 className="view-title">Плейлисты</h1>
          <div className="view-subtitle">
            {playlists.length
              ? `${playlists.length} ${plural(playlists.length, "плейлист", "плейлиста", "плейлистов")}`
              : "Собирайте песни в свои подборки"}
          </div>
        </div>
        <div className="view-actions">
          <button className="pill-btn pill-btn--accent" onClick={() => setCreating(true)}>
            <PlusIcon /> Новый плейлист
          </button>
        </div>
      </header>

      {creating && (
        <NameForm
          placeholder="Название плейлиста"
          submitLabel="Создать"
          onCancel={() => setCreating(false)}
          onSubmit={async (name) => {
            const p = await createPlaylist(name);
            if (p) {
              uiStore.set({ openPlaylistId: p.id });
              setCreating(false);
            }
          }}
        />
      )}

      {playlists.length === 0 ? (
        !creating && (
          <EmptyState
            icon={<PlaylistIcon />}
            title="Плейлистов пока нет"
            text="Создайте плейлист и добавьте в него песни — здесь или кнопкой «+» у песни в «Моей музыке»."
            action={
              <button className="pill-btn pill-btn--accent" onClick={() => setCreating(true)}>
                <PlusIcon /> Новый плейлист
              </button>
            }
          />
        )
      ) : (
        <div className="playlists-layout">
          <div className="admin-list glass-card playlist-list">
            {playlists.map((p) => (
              <button
                key={p.id}
                className={`mini-row ${p.id === selected?.id ? "is-selected" : ""}`}
                onClick={() => uiStore.set({ openPlaylistId: p.id })}
              >
                <PlaylistCover playlist={p} className="mini-cover" />
                <div className="row-text">
                  <div className="row-title">{p.name}</div>
                  <div className="row-artist">{songs(p.trackIds.length)}</div>
                </div>
              </button>
            ))}
          </div>
          {selected && <PlaylistDetail key={selected.id} playlist={selected} />}
        </div>
      )}
    </div>
  );
}

function PlaylistDetail({ playlist }: { playlist: Playlist }) {
  const byId = useLibrary((s) => s.byId);
  const currentId = useQueue((s) => s.currentId);
  const playing = usePlayer((s) => s.playing);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [picking, setPicking] = useState(false);

  const tracks = useMemo(
    () => playlist.trackIds.map((id) => byId.get(id)).filter((t): t is Track => !!t),
    [playlist.trackIds, byId],
  );
  // Очередь = порядок плейлиста (без пропавших файлов)
  const playable = useMemo(() => tracks.filter((t) => !t.missing).map((t) => t.id), [tracks]);
  const totalMs = tracks.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);

  return (
    <div className="playlist-detail">
      <div className="playlist-head glass-card">
        <PlaylistCover playlist={playlist} className="playlist-head-cover" />
        <div className="playlist-head-info">
          {renaming ? (
            <NameForm
              initial={playlist.name}
              placeholder="Название плейлиста"
              submitLabel="Сохранить"
              onCancel={() => setRenaming(false)}
              onSubmit={async (name) => {
                await renamePlaylist(playlist.id, name);
                setRenaming(false);
              }}
            />
          ) : (
            <div className="editor-title-row">
              <div className="editor-title">{playlist.name}</div>
              <button
                className="icon-btn icon-btn--tiny"
                onClick={() => setRenaming(true)}
                title="Переименовать"
                aria-label="Переименовать плейлист"
              >
                <PencilIcon />
              </button>
            </div>
          )}
          <div className="muted">
            {songs(tracks.length)}
            {totalMs > 0 && ` · ${formatTotal(totalMs)}`}
          </div>
          <div className="editor-actions">
            <button className="pill-btn pill-btn--accent" disabled={!playable.length} onClick={() => void playAll(playable, { shuffle: false })}>
              <PlayIcon /> Слушать
            </button>
            <button className="pill-btn" disabled={!playable.length} onClick={() => void playAll(playable, { shuffle: true })}>
              <ShuffleIcon /> Перемешать
            </button>
            <button className="pill-btn" onClick={() => setPicking((v) => !v)}>
              <PlusIcon /> {picking ? "Готово" : "Добавить песни"}
            </button>
            {confirmDelete ? (
              <>
                <button className="pill-btn pill-btn--danger" onClick={() => void deletePlaylist(playlist.id)}>
                  Да, удалить плейлист
                </button>
                <button className="pill-btn" onClick={() => setConfirmDelete(false)}>
                  Отмена
                </button>
              </>
            ) : (
              <button className="pill-btn" onClick={() => setConfirmDelete(true)} title="Песни останутся в библиотеке">
                <TrashIcon /> Удалить
              </button>
            )}
          </div>
        </div>
      </div>

      {picking ? (
        <TrackPicker playlist={playlist} onClose={() => setPicking(false)} />
      ) : tracks.length === 0 ? (
        <EmptyState
          icon={<PlaylistIcon />}
          title="Плейлист пуст"
          text="Добавьте песни кнопкой «Добавить песни» или через «+» у песни в «Моей музыке»."
          action={
            <button className="pill-btn pill-btn--accent" onClick={() => setPicking(true)}>
              <PlusIcon /> Добавить песни
            </button>
          }
        />
      ) : (
        <div className="track-table track-table--playlist">
          <div className="track-head">
            <span className="col-index">#</span>
            <span>Название</span>
            <span className="col-album">Альбом</span>
            <span className="col-time">Время</span>
            <span />
          </div>
          <VirtualList
            className="track-list"
            items={tracks}
            rowHeight={60}
            getKey={(t) => t.id}
            renderRow={(t, i) => (
              <TrackRow
                track={t}
                index={i}
                current={t.id === currentId}
                playing={playing}
                onPlay={() => void playTrack(t.id, playable)}
                actions={
                  <>
                    <RowButton title="Выше" disabled={i === 0} onClick={() => void moveInPlaylist(playlist.id, t.id, -1)}>
                      <SortArrowIcon className="is-up" />
                    </RowButton>
                    <RowButton title="Ниже" disabled={i === tracks.length - 1} onClick={() => void moveInPlaylist(playlist.id, t.id, 1)}>
                      <SortArrowIcon />
                    </RowButton>
                    <RowButton title="Убрать из плейлиста" onClick={() => void removeFromPlaylist(playlist.id, [t.id])}>
                      <CloseIcon />
                    </RowButton>
                  </>
                }
              />
            )}
          />
        </div>
      )}
    </div>
  );
}

/** Выбор песен из библиотеки с галочками. */
function TrackPicker({ playlist, onClose }: { playlist: Playlist; onClose: () => void }) {
  const tracks = useLibrary((s) => s.tracks);
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const inPlaylist = useMemo(() => new Set(playlist.trackIds), [playlist.trackIds]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return tracks;
    return tracks.filter((t) => normalize(`${t.title} ${t.artist ?? ""} ${t.album ?? ""}`).includes(q));
  }, [tracks, query]);

  const toggle = (id: string) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const add = async () => {
    // В порядке библиотеки — так песни альбома встанут по номерам
    const ids = tracks.filter((t) => checked.has(t.id)).map((t) => t.id);
    await addToPlaylist(playlist.id, ids);
    onClose();
  };

  return (
    <div className="picker glass-card">
      <div className="picker-head">
        <SearchField value={query} onChange={setQuery} placeholder="Найти песню" />
        <span className="muted picker-count">Выбрано: {checked.size}</span>
        <button className="pill-btn pill-btn--accent" disabled={!checked.size} onClick={() => void add()}>
          Добавить
        </button>
        <button className="pill-btn" onClick={onClose}>
          Отмена
        </button>
      </div>
      <VirtualList
        className="picker-list"
        items={filtered}
        rowHeight={54}
        getKey={(t) => t.id}
        renderRow={(t) => {
          const already = inPlaylist.has(t.id);
          return (
            <button
              className={`mini-row picker-row ${checked.has(t.id) ? "is-checked" : ""}`}
              disabled={already}
              onClick={() => toggle(t.id)}
            >
              <span className="checkbox" aria-hidden>
                {(checked.has(t.id) || already) && "✓"}
              </span>
              <Cover src={t.coverSmall} seed={t.id} className="mini-cover" />
              <div className="row-text">
                <div className="row-title">{t.title}</div>
                <div className="row-artist">{t.artist ?? "Неизвестный исполнитель"}</div>
              </div>
              {already && <span className="chip">уже в плейлисте</span>}
            </button>
          );
        }}
      />
    </div>
  );
}

/** Поле ввода названия + «Создать/Сохранить» + «Отмена». */
function NameForm({
  initial = "",
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="name-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit(name);
        setBusy(false);
      }}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} maxLength={100} />
      <button className="pill-btn pill-btn--accent" type="submit" disabled={busy}>
        {submitLabel}
      </button>
      <button className="pill-btn" type="button" onClick={onCancel}>
        Отмена
      </button>
    </form>
  );
}
