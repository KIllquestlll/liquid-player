// Левое меню: зоны приложения. Можно свернуть до одних иконок —
// состояние запоминается между запусками.
import { useEffect, useState } from "react";
import { getAppInfo, isTauri } from "../../lib/ipc";
import { useLibrary } from "../../library/store";
import { usePlaylists } from "../../playlists/store";
import { navigate, toggleSidebar, useUi, type View } from "../../ui/store";
import { AdminIcon, HomeIcon, MusicIcon, PlaylistIcon, SidebarIcon } from "../icons";

const ZONES: { view: View; label: string; Icon: typeof HomeIcon }[] = [
  { view: "home", label: "Главная", Icon: HomeIcon },
  { view: "music", label: "Моя музыка", Icon: MusicIcon },
  { view: "playlists", label: "Плейлисты", Icon: PlaylistIcon },
  { view: "admin", label: "Админ-панель", Icon: AdminIcon },
];

export function Sidebar() {
  const view = useUi((s) => s.view);
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const trackCount = useLibrary((s) => s.tracks.length);
  const playlistCount = usePlaylists((s) => s.playlists.length);
  const [version, setVersion] = useState("");
  const activeIndex = ZONES.findIndex((z) => z.view === view);

  useEffect(() => {
    if (isTauri()) getAppInfo().then((i) => setVersion(i.version)).catch(() => {});
  }, []);

  return (
    <nav className={`sidebar glass ${collapsed ? "is-collapsed" : ""}`} aria-label="Разделы">
      <div className="brand">
        <div className="brand-mark" aria-hidden>
          ♫
        </div>
        <span className="brand-name fade-label">Liquid Player</span>
      </div>

      <div className="nav">
        {/* Стеклянная «капля», которая переезжает к выбранному пункту */}
        <div className="nav-indicator" style={{ transform: `translateY(${activeIndex * 100}%)` }} aria-hidden />
        {ZONES.map(({ view: v, label, Icon }) => (
          <button
            key={v}
            className={`nav-item ${v === view ? "is-active" : ""}`}
            onClick={() => navigate(v)}
            aria-current={v === view ? "page" : undefined}
            aria-label={label}
            // В свёрнутом виде название показывается подсказкой при наведении
            title={collapsed ? label : undefined}
          >
            <Icon />
            <span className="fade-label">{label}</span>
            {v === "music" && trackCount > 0 && <span className="nav-badge fade-label">{trackCount}</span>}
            {v === "playlists" && playlistCount > 0 && <span className="nav-badge fade-label">{playlistCount}</span>}
          </button>
        ))}
      </div>

      <button
        className="nav-item sidebar-toggle"
        onClick={toggleSidebar}
        aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
        title={collapsed ? "Развернуть меню" : undefined}
      >
        <SidebarIcon />
        <span className="fade-label">Свернуть меню</span>
      </button>
      <div className="sidebar-footer fade-label">Liquid Player {version && `v${version}`}</div>
    </nav>
  );
}
