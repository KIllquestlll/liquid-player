// Админ-панель → «Треки и оформление»: слева список, справа редактор выбранного трека.
import { useMemo, useState } from "react";
import { Cover } from "../../components/Cover";
import { VirtualList } from "../../components/VirtualList";
import { ImageIcon, PencilIcon, WarningIcon } from "../../components/icons";
import { EmptyState, SearchField } from "../../components/ui";
import { normalize } from "../../lib/format";
import { useLibrary } from "../../library/store";
import { uiStore, useUi } from "../../ui/store";
import { TrackEditor } from "./TrackEditor";

export function TrackManager() {
  const tracks = useLibrary((s) => s.tracks);
  const byId = useLibrary((s) => s.byId);
  const editId = useUi((s) => s.editTrackId);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return tracks;
    return tracks.filter((t) => normalize(`${t.title} ${t.artist ?? ""} ${t.album ?? ""}`).includes(q));
  }, [tracks, query]);

  const selected = editId ? byId.get(editId) : undefined;

  if (tracks.length === 0) {
    return (
      <EmptyState
        icon={<PencilIcon />}
        title="Пока нечего редактировать"
        text="Сначала добавьте музыку на вкладке «Добавить музыку»."
      />
    );
  }

  return (
    <div className="admin-tracks">
      <div className="admin-list glass-card">
        <SearchField value={query} onChange={setQuery} placeholder="Найти трек" />
        <VirtualList
          className="mini-list"
          items={filtered}
          rowHeight={56}
          getKey={(t) => t.id}
          renderRow={(t) => (
            <button
              className={`mini-row ${t.id === editId ? "is-selected" : ""}`}
              onClick={() => uiStore.set({ editTrackId: t.id })}
            >
              <Cover src={t.coverSmall} seed={t.id} className="mini-cover" />
              <div className="row-text">
                <div className="row-title">{t.title}</div>
                <div className="row-artist">{t.artist ?? "Неизвестный исполнитель"}</div>
              </div>
              {t.missing && (
                <span className="mini-flag mini-flag--warn" title="Файл не найден">
                  <WarningIcon />
                </span>
              )}
              {!t.cover && !t.missing && (
                <span className="mini-flag" title="Нет обложки">
                  <ImageIcon />
                </span>
              )}
            </button>
          )}
        />
      </div>

      {selected ? (
        <TrackEditor key={selected.id} track={selected} />
      ) : (
        <div className="glass-card editor-placeholder">
          <PencilIcon />
          <p>Выберите трек слева, чтобы поменять обложку, фон или текст песни</p>
        </div>
      )}
    </div>
  );
}
