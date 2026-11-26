// Зона 3 — «Админ-панель»: добавление музыки и редактирование треков.
import type { ReactNode } from "react";
import { FilePlusIcon, PencilIcon } from "../components/icons";
import { Segmented } from "../components/ui";
import { setAdminTab, useUi, type AdminTab } from "../ui/store";
import { ImportPanel } from "./admin/ImportPanel";
import { TrackManager } from "./admin/TrackManager";

const TABS: { id: AdminTab; label: string; icon: ReactNode }[] = [
  { id: "import", label: "Добавить музыку", icon: <FilePlusIcon /> },
  { id: "tracks", label: "Треки и оформление", icon: <PencilIcon /> },
];

export function AdminView() {
  const tab = useUi((s) => s.adminTab);

  return (
    <div className="view admin-view">
      <header className="view-header">
        <div>
          <h1 className="view-title">Админ-панель</h1>
          <div className="view-subtitle">Добавление музыки, обложки, фоны и тексты песен</div>
        </div>
        <Segmented value={tab} options={TABS} onChange={setAdminTab} />
      </header>

      {/* key — чтобы вкладка плавно появлялась при переключении */}
      <div key={tab} className={`admin-body admin-body--${tab} view-enter`}>
        {tab === "import" ? <ImportPanel /> : <TrackManager />}
      </div>
    </div>
  );
}
