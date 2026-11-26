// Зона «Главная»: недавно прослушанное и ваши плейлисты.
import { Cover } from "../components/Cover";
import { PlaylistCover } from "../components/PlaylistCover";
import { CloseIcon, PlayIcon, PlusIcon } from "../components/icons";
import { formatAgo, plural } from "../lib/format";
import type { Track } from "../lib/ipc";
import { useLibrary } from "../library/store";
import { playTrack, useQueue } from "../player/queue";
import { clearHistory, removeFromHistory, usePlaylists } from "../playlists/store";
import { openPlaylist } from "../ui/store";

/** Сколько недавних песен показывать */
const RECENT_SHOWN = 30;

export function HomeView() {
  const recent = usePlaylists((s) => s.recent);
  const playlists = usePlaylists((s) => s.playlists);
  const byId = useLibrary((s) => s.byId);
  const currentId = useQueue((s) => s.currentId);

  const items = recent
    .map((r) => ({ r, t: byId.get(r.trackId) }))
    .filter((x): x is { r: (typeof recent)[number]; t: Track } => !!x.t)
    .slice(0, RECENT_SHOWN);
  // Включили песню отсюда — дальше играет этот же список
  const queue = items.filter((x) => !x.t.missing).map((x) => x.t.id);

  return (
    <div className="view home-view">
      <header className="view-header">
        <div>
          <h1 className="view-title">Главная</h1>
          <div className="view-subtitle">Недавно прослушанное и ваши плейлисты</div>
        </div>
      </header>

      <section className="home-section">
        <div className="home-section-head">
          <h2>Недавно прослушанное</h2>
          {items.length > 0 && (
            <button className="link-btn" onClick={() => void clearHistory()}>
              Очистить историю
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="home-empty glass-card muted">
            Здесь появятся песни, которые вы слушали. Песня попадает сюда после 30 секунд прослушивания (или половины, если
            она короче минуты).
          </div>
        ) : (
          <div className="card-grid">
            {items.map(({ r, t }) => (
              <div
                key={t.id}
                className={`music-card ${t.id === currentId ? "is-current" : ""} ${t.missing ? "is-missing" : ""}`}
                onClick={() => !t.missing && void playTrack(t.id, queue)}
                title={r.plays > 1 ? `Слушали ${r.plays} ${plural(r.plays, "раз", "раза", "раз")}` : undefined}
              >
                <div className="music-card-cover">
                  <Cover src={t.coverSmall} seed={t.id} />
                  <span className="music-card-play" aria-hidden>
                    <PlayIcon />
                  </span>
                  <button
                    className="music-card-remove"
                    title="Убрать из истории"
                    aria-label="Убрать из истории"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeFromHistory(t.id);
                    }}
                  >
                    <CloseIcon />
                  </button>
                </div>
                <div className="music-card-title">{t.title}</div>
                <div className="music-card-sub">
                  {t.artist ?? "Неизвестный исполнитель"} · {formatAgo(r.lastPlayedAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2>Ваши плейлисты</h2>
          {playlists.length > 0 && (
            <button className="link-btn" onClick={() => openPlaylist(null)}>
              Все плейлисты
            </button>
          )}
        </div>
        {playlists.length === 0 ? (
          <div className="home-empty glass-card">
            <span className="muted">Плейлистов пока нет.</span>
            <button className="pill-btn" onClick={() => openPlaylist(null)}>
              <PlusIcon /> Создать плейлист
            </button>
          </div>
        ) : (
          <div className="card-grid">
            {playlists.slice(0, 12).map((p) => (
              <div key={p.id} className="music-card" onClick={() => openPlaylist(p.id)}>
                <div className="music-card-cover">
                  <PlaylistCover playlist={p} />
                </div>
                <div className="music-card-title">{p.name}</div>
                <div className="music-card-sub">
                  {p.trackIds.length} {plural(p.trackIds.length, "песня", "песни", "песен")}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
