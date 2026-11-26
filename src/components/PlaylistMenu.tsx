// Всплывающее меню «Добавить в плейлист» (кнопка «+» у песни или в нижней панели).
import { useEffect, useRef, useState } from "react";
import { addToPlaylist, createPlaylist, usePlaylists } from "../playlists/store";
import { closePlaylistMenu, useUi } from "../ui/store";
import { PlaylistCover } from "./PlaylistCover";
import { PlusIcon } from "./icons";

const WIDTH = 270;
const MAX_HEIGHT = 340;

export function PlaylistMenu() {
  const menu = useUi((s) => s.playlistMenu);
  const playlists = usePlaylists((s) => s.playlists);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Клик мимо меню или Esc — закрыть
  useEffect(() => {
    if (!menu) return;
    setCreating(false);
    setName("");
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closePlaylistMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePlaylistMenu();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  if (!menu) return null;

  // Меню выравнивается по правому краю кнопки; если снизу мало места — открывается вверх
  const left = Math.min(Math.max(8, menu.x - WIDTH), window.innerWidth - WIDTH - 8);
  const opensUp = menu.bottom + MAX_HEIGHT + 12 > window.innerHeight;
  const style = opensUp ? { left, bottom: window.innerHeight - menu.top + 6 } : { left, top: menu.bottom + 6 };

  const create = async () => {
    const p = await createPlaylist(name, menu.trackIds);
    if (p) closePlaylistMenu();
  };

  return (
    <div ref={ref} className="playlist-menu" style={{ ...style, width: WIDTH, maxHeight: MAX_HEIGHT }} role="menu">
      <div className="playlist-menu-title">Добавить в плейлист</div>

      {creating ? (
        <form
          className="playlist-menu-new"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Название плейлиста" />
          <button className="pill-btn pill-btn--accent" type="submit">
            Создать
          </button>
        </form>
      ) : (
        <button className="playlist-menu-item" onClick={() => setCreating(true)}>
          <span className="playlist-menu-plus">
            <PlusIcon />
          </span>
          Новый плейлист…
        </button>
      )}

      <div className="playlist-menu-list">
        {playlists.map((p) => {
          const has = menu.trackIds.every((id) => p.trackIds.includes(id));
          return (
            <button
              key={p.id}
              className="playlist-menu-item"
              disabled={has}
              onClick={() => {
                closePlaylistMenu();
                void addToPlaylist(p.id, menu.trackIds);
              }}
            >
              <PlaylistCover playlist={p} className="playlist-menu-cover" />
              <span className="playlist-menu-name">{p.name}</span>
              {has && <span className="muted">уже есть</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
