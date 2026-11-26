// Иконки — встроенные SVG. Цвет берут из CSS (currentColor), размер задаёт CSS.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const filled = { viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true } as const;
const outline = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

// ---------- Воспроизведение ----------

export const PlayIcon = (p: IconProps) => (
  <svg {...filled} {...p}>
    <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11.1-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z" />
  </svg>
);

export const PauseIcon = (p: IconProps) => (
  <svg {...filled} {...p}>
    <rect x="6" y="4.5" width="4.2" height="15" rx="1.4" />
    <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4" />
  </svg>
);

export const PrevIcon = (p: IconProps) => (
  <svg {...filled} {...p}>
    <path d="M11.5 6.4v11.2a.8.8 0 0 1-1.25.66L2.9 13.1a1.3 1.3 0 0 1 0-2.2l7.35-5.16a.8.8 0 0 1 1.25.66zM21 6.4v11.2a.8.8 0 0 1-1.25.66l-7.35-5.16a1.3 1.3 0 0 1 0-2.2l7.35-5.16A.8.8 0 0 1 21 6.4z" />
  </svg>
);

export const NextIcon = (p: IconProps) => (
  <svg {...filled} {...p}>
    <path d="M12.5 6.4v11.2a.8.8 0 0 0 1.25.66l7.35-5.16a1.3 1.3 0 0 0 0-2.2l-7.35-5.16a.8.8 0 0 0-1.25.66zM3 6.4v11.2a.8.8 0 0 0 1.25.66l7.35-5.16a1.3 1.3 0 0 0 0-2.2L4.25 5.74A.8.8 0 0 0 3 6.4z" />
  </svg>
);

export const ShuffleIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M3 7h3.5c2 0 3.2.9 4.3 2.6l2.4 3.8C14.3 15.1 15.5 16 17.5 16H21M3 16h3.5c1.3 0 2.2-.4 3-1.1M14.2 8.1c.9-.8 1.9-1.1 3.3-1.1H21M18.5 4.5 21 7l-2.5 2.5M18.5 13.5 21 16l-2.5 2.5" />
  </svg>
);

export const RepeatIcon = ({ one, ...p }: IconProps & { one?: boolean }) => (
  <svg {...outline} {...p}>
    <path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19M16.5 3.5 19 6l-2.5 2.5M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5M7.5 20.5 5 18l2.5-2.5" />
    {one && <path d="M11 10.8l1.4-.8v4.4" strokeWidth={1.6} />}
  </svg>
);

const Speaker = () => (
  <path
    d="M3.5 9.5v5a1 1 0 0 0 1 1h3l4.3 3.6a.8.8 0 0 0 1.3-.62V5.52a.8.8 0 0 0-1.3-.62L7.5 8.5h-3a1 1 0 0 0-1 1z"
    fill="currentColor"
    stroke="none"
  />
);

export const VolumeIcon = ({ level, ...p }: IconProps & { level: number }) => (
  <svg {...outline} {...p}>
    <Speaker />
    {level === 0 ? (
      <path d="M16.5 9.5l4 5M20.5 9.5l-4 5" />
    ) : (
      <>
        <path d="M16.2 9.2a4 4 0 0 1 0 5.6" />
        <path d="M18.8 6.6a7.6 7.6 0 0 1 0 10.8" opacity={level > 0.5 ? 1 : 0.25} />
      </>
    )}
  </svg>
);

// ---------- Навигация ----------

export const HomeIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  </svg>
);

export const MusicIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M9 17.5V6.2l10-2.2v11.5" />
    <circle cx="6.5" cy="17.5" r="2.5" />
    <circle cx="16.5" cy="15.5" r="2.5" />
  </svg>
);

export const PlaylistIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M4 6h11M4 11h11M4 16h7M18.5 18.5V8l2.5-1" />
    <circle cx="16.8" cy="18.5" r="1.8" />
  </svg>
);

export const AdminIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
);

// ---------- Разное ----------

export const SearchIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </svg>
);

export const FolderIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
  </svg>
);

export const FilePlusIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5zM14 3.5v4h4M12 10.5v6M9 13.5h6" />
  </svg>
);

export const TrashIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M4.5 7h15M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7M6.5 7l.8 11.4c.1.9.8 1.6 1.7 1.6h6c.9 0 1.6-.7 1.7-1.6L17.5 7M10 11v5M14 11v5" />
  </svg>
);

export const ExpandIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" />
  </svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const PencilIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17zM14.5 7.5l2 2" />
  </svg>
);

export const ImageIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    <path d="M4 15.5l4.5-4.5 4 4 2.5-2.5 5 5" />
    <circle cx="15.5" cy="9" r="1.5" />
  </svg>
);

export const WallpaperIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M4 7.5V6a2 2 0 0 1 2-2h1.5M16.5 4H18a2 2 0 0 1 2 2v1.5M20 16.5V18a2 2 0 0 1-2 2h-1.5M7.5 20H6a2 2 0 0 1-2-2v-1.5" />
    <path d="M7 16l3.5-3.5 2.5 2.5 1.5-1.5L17 16" />
    <circle cx="14.5" cy="9" r="1.4" />
  </svg>
);

export const ResetIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M4.5 5v4.5H9" />
    <path d="M5 13.5a7 7 0 1 0 1.6-6.4L4.5 9.5" />
  </svg>
);

/** Свернуть/развернуть боковое меню */
export const SidebarIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <path d="M9.5 4.5v15M14.5 10l-2 2 2 2" />
  </svg>
);

/** Стрелка направления сортировки (вниз; для «вверх» поворачиваем CSS) */
export const SortArrowIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" />
  </svg>
);

export const LyricsIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M5 6h14M5 10.5h14M5 15h9M5 19.5h6" />
  </svg>
);

export const WarningIcon = (p: IconProps) => (
  <svg {...outline} {...p}>
    <path d="M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2v.1" />
  </svg>
);

export const PlusIcon = (p: IconProps) => (
  <svg {...outline} {...p} strokeWidth={2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg {...outline} {...p} strokeWidth={2}>
    <path d="M7 7l10 10M17 7L7 17" />
  </svg>
);
