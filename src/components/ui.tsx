// Мелкие переиспользуемые элементы интерфейса.
import type { CSSProperties, ReactNode } from "react";
import { CloseIcon, SearchIcon } from "./icons";

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search">
      <SearchIcon className="search-icon" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button className="search-clear" onClick={() => onChange("")} aria-label="Очистить поиск">
          <CloseIcon />
        </button>
      )}
    </label>
  );
}

/** Переключатель-«пилюля» со скользящей подсветкой (как в iOS). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string; icon?: ReactNode }[];
  onChange: (id: T) => void;
}) {
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className="segmented" role="tablist" style={{ "--count": options.length } as CSSProperties}>
      <div className="segmented-indicator" style={{ transform: `translateX(${index * 100}%)` }} aria-hidden />
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={o.id === value}
          className={`segmented-item ${o.id === value ? "is-active" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Три прыгающие полоски у играющего трека. */
export function Equalizer({ active }: { active: boolean }) {
  return (
    <span className={`equalizer ${active ? "is-active" : ""}`} aria-label={active ? "Играет" : "На паузе"}>
      <i />
      <i />
      <i />
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <h2>{title}</h2>
      <p className="muted">{text}</p>
      {action}
    </div>
  );
}
