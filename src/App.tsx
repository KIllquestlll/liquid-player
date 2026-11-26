// Корень интерфейса. Зоны:
//   «Главная»       — недавно прослушанное и ваши плейлисты
//   «Моя музыка»    — список песен
//   «Плейлисты»     — свои подборки песен
//   «Админ-панель»  — добавление музыки, оформление и тексты треков
// Внизу — панель плеера (видна везде), поверх — полноэкранный плеер.
import { useEffect } from "react";
import { PlaylistMenu } from "./components/PlaylistMenu";
import { Backdrop } from "./components/layout/Backdrop";
import { NowPlayingOverlay } from "./components/layout/NowPlayingOverlay";
import { DropOverlay, Toast } from "./components/layout/Overlays";
import { PlayerBar } from "./components/layout/PlayerBar";
import { Sidebar } from "./components/layout/Sidebar";
import { isTauri } from "./lib/ipc";
import { initDragDrop, initLibrary } from "./library/store";
import { initLyrics } from "./lyrics/store";
import { initPlayer } from "./player/controller";
import { initHotkeys } from "./player/hotkeys";
import { restoreCurrent } from "./player/queue";
import { initPlaylists } from "./playlists/store";
import { showToast, useUi } from "./ui/store";
import { AdminView } from "./views/AdminView";
import { HomeView } from "./views/HomeView";
import { MusicView } from "./views/MusicView";
import { PlaylistsView } from "./views/PlaylistsView";

export default function App() {
  const view = useUi((s) => s.view);
  const nowPlayingOpen = useUi((s) => s.nowPlayingOpen);
  const sidebarCollapsed = useUi((s) => s.sidebarCollapsed);

  useEffect(() => {
    if (!isTauri()) {
      showToast("Страница открыта в браузере — запустите приложение через .exe", "error");
      return;
    }

    // Подписки создаются асинхронно. Если компонент успел размонтироваться
    // (React в режиме разработки делает это специально), сразу отписываемся.
    let disposed = false;
    const cleanups: Array<() => void> = [initHotkeys()];
    const keep = (off: () => void) => (disposed ? off() : cleanups.push(off));

    Promise.all([initPlayer(), initLibrary(), initLyrics(), initPlaylists()]).then((offs) => {
      offs.forEach(keep);
      restoreCurrent();
    });
    initDragDrop().then(keep);

    return () => {
      disposed = true;
      cleanups.forEach((off) => off());
    };
  }, []);

  return (
    <>
      <Backdrop />
      <div className={`shell ${nowPlayingOpen ? "is-covered" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <Sidebar />
        {/* key={view}: при смене зоны контент заново «въезжает» с анимацией */}
        <main key={view} className="content glass view-enter">
          {view === "home" && <HomeView />}
          {view === "music" && <MusicView />}
          {view === "playlists" && <PlaylistsView />}
          {view === "admin" && <AdminView />}
        </main>
        <PlayerBar />
      </div>
      <NowPlayingOverlay />
      <PlaylistMenu />
      <Toast />
      <DropOverlay />
    </>
  );
}
