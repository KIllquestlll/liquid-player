// Всплывающие сообщения и подсказка при перетаскивании файлов.
import { useEffect } from "react";
import { dismissToast, useUi } from "../../ui/store";
import { CloseIcon } from "../icons";

export function Toast() {
  const toast = useUi((s) => s.toast);

  // Сообщение исчезает само: ошибки — через 8 с, остальное — через 5 с
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismissToast, toast.kind === "error" ? 8000 : 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <div key={toast.id} className={`toast toast--${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>
      <span className={`dot ${toast.kind === "error" ? "dot--error" : ""}`} />
      <span className="toast-text">{toast.text}</span>
      <button className="icon-btn icon-btn--tiny" onClick={dismissToast} aria-label="Закрыть">
        <CloseIcon />
      </button>
    </div>
  );
}

export function DropOverlay() {
  const visible = useUi((s) => s.dropHover);
  return (
    <div className={`drop-overlay ${visible ? "is-visible" : ""}`} aria-hidden>
      <div className="drop-overlay-box">
        <div className="drop-overlay-title">Отпустите, чтобы добавить в библиотеку</div>
        <div className="muted">Файлы и целые папки · MP3, FLAC, OGG, WAV, M4A</div>
      </div>
    </div>
  );
}
