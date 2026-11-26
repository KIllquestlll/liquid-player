// Редактор одного трека: название/исполнитель + разделы «Обложка», «Фон», «Текст песни».
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Cover } from "../../components/Cover";
import { GlassSlider } from "../../components/GlassSlider";
import { BackdropView } from "../../components/layout/Backdrop";
import { ImageIcon, PencilIcon, PlayIcon, ResetIcon, TrashIcon, WallpaperIcon } from "../../components/icons";
import { fileFormat, formatTime } from "../../lib/format";
import { trackApi, type ImageKind, type Track } from "../../lib/ipc";
import { useElementWidth } from "../../lib/useElementWidth";
import { chooseImage, DEFAULT_BLUR, DEFAULT_DIM, MAX_BLUR, resetImage, setLook } from "../../library/appearance";
import { libraryStore, removeTracks, updateTrack } from "../../library/store";
import { playTrack, useQueue } from "../../player/queue";
import { showError, showToast, uiStore, useUi, type EditorSection } from "../../ui/store";
import { LyricsSection } from "./LyricsSection";

/** Плавно прокрутить редактор к разделу */
const jumpTo = (section: EditorSection) =>
  document.getElementById(`section-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

const JUMPS: { id: EditorSection; label: string }[] = [
  { id: "cover", label: "Обложка" },
  { id: "background", label: "Фон" },
  { id: "lyrics", label: "Текст песни" },
];

export function TrackEditor({ track }: { track: Track }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const focus = useUi((s) => s.editFocus);

  // Открыли редактор «с прицелом» (например, из «Текст не найден») — прокручиваем к разделу
  useEffect(() => {
    if (!focus) return;
    const timer = window.setTimeout(() => {
      jumpTo(focus);
      uiStore.set({ editFocus: null });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [focus, track.id]);
  // Какая картинка сейчас обрабатывается (большое фото сжимается ~1 с)
  const [busy, setBusy] = useState<ImageKind | null>(null);
  const isCurrent = useQueue((s) => s.currentId === track.id);

  const play = () => {
    const ids = libraryStore.get().tracks.filter((t) => !t.missing).map((t) => t.id);
    void playTrack(track.id, ids);
  };

  const remove = () => {
    uiStore.set({ editTrackId: null });
    void removeTracks([track.id]);
  };

  const run = async (kind: ImageKind, action: () => Promise<unknown>) => {
    setBusy(kind);
    await action();
    setBusy(null);
  };

  const lookIsDefault = Math.abs(track.dim - DEFAULT_DIM) < 0.005 && Math.abs(track.blur - DEFAULT_BLUR) < 0.5;

  return (
    <div className="editor">
      <div className="editor-head glass-card">
        <Cover src={track.cover} seed={track.id} className="editor-cover" />
        <div className="editor-info">
          {editingInfo ? (
            <InfoForm track={track} onClose={() => setEditingInfo(false)} />
          ) : (
            <>
              <div className="editor-title-row">
                <div className="editor-title">{track.title}</div>
                <button
                  className="icon-btn icon-btn--tiny"
                  onClick={() => setEditingInfo(true)}
                  title="Изменить название и исполнителя"
                  aria-label="Изменить название и исполнителя"
                >
                  <PencilIcon />
                </button>
              </div>
              <div className="editor-artist">
                {track.artist ?? "Неизвестный исполнитель"}
                {track.album && <span className="muted"> — {track.album}</span>}
                {track.infoEdited && (
                  <button className="link-btn info-reset" onClick={() => void resetInfo(track.id)}>
                    вернуть из тегов файла
                  </button>
                )}
              </div>
            </>
          )}
          <div className="chips">
            <span className="chip">{fileFormat(track.path)}</span>
            {track.durationMs !== null && <span className="chip">{formatTime(track.durationMs)}</span>}
            {track.trackNo !== null && <span className="chip">трек № {track.trackNo}</span>}
            {track.missing && <span className="chip chip--warn">файл не найден</span>}
          </div>
          <div className="editor-path selectable" title={track.path}>
            {track.path}
          </div>
          <div className="editor-actions">
            <button className="pill-btn pill-btn--accent" onClick={play} disabled={track.missing}>
              <PlayIcon /> Слушать
            </button>
            {confirmRemove ? (
              <>
                <button className="pill-btn pill-btn--danger" onClick={remove}>
                  Да, убрать
                </button>
                <button className="pill-btn" onClick={() => setConfirmRemove(false)}>
                  Отмена
                </button>
              </>
            ) : (
              <button className="pill-btn" onClick={() => setConfirmRemove(true)} title="Файл на диске останется">
                <TrashIcon /> Убрать из библиотеки
              </button>
            )}
          </div>
          <div className="editor-jumps">
            {JUMPS.map((j) => (
              <button key={j.id} className="link-btn" onClick={() => jumpTo(j.id)}>
                {j.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="editor-sections">
        {/* ---------- Обложка ---------- */}
        <Section
          id="section-cover"
          icon={<ImageIcon />}
          title="Обложка"
          status={track.hasCustomCover ? "своя картинка" : track.hasFileCover ? "из файла" : "нет"}
          full
        >
          <div className="cover-edit">
            <Cover src={track.cover} seed={track.id} className="cover-edit-preview" />
            <div className="section-actions section-actions--column">
              <button className="pill-btn" disabled={busy !== null} onClick={() => run("cover", () => chooseImage(track.id, "cover"))}>
                <ImageIcon /> {busy === "cover" ? "Обработка…" : "Выбрать картинку…"}
              </button>
              <button
                className="pill-btn"
                disabled={busy !== null || !track.hasCustomCover}
                onClick={() => run("cover", () => resetImage(track.id, "cover"))}
              >
                <ResetIcon /> Вернуть из файла
              </button>
            </div>
          </div>
          <p className="section-text muted">
            {track.hasCustomCover
              ? track.hasFileCover
                ? "Показывается ваша картинка. «Вернуть из файла» снова покажет обложку из тегов."
                : "Показывается ваша картинка. В самом файле обложки нет."
              : "Картинка копируется в папку приложения и сжимается — оригинал можно потом удалить."}
          </p>
        </Section>

        {/* ---------- Фон ---------- */}
        <Section
          id="section-background"
          icon={<WallpaperIcon />}
          title="Фон"
          status={track.background ? "своя картинка" : track.cover ? "размытая обложка" : "градиент"}
          full
        >
          <div className="bg-editor">
            <BackgroundPreview track={track} />
            <div className="bg-controls">
              <div className="section-actions">
                <button
                  className="pill-btn"
                  disabled={busy !== null}
                  onClick={() => run("background", () => chooseImage(track.id, "background"))}
                >
                  <WallpaperIcon /> {busy === "background" ? "Обработка…" : "Выбрать картинку…"}
                </button>
                <button
                  className="pill-btn"
                  disabled={busy !== null || !track.background}
                  onClick={() => run("background", () => resetImage(track.id, "background"))}
                >
                  <ResetIcon /> Убрать свою картинку
                </button>
              </div>

              <div className="look-row">
                <span>Затемнение</span>
                <GlassSlider
                  label="Затемнение фона"
                  value={track.dim}
                  onChange={(v) => setLook(track.id, round2(v), track.blur)}
                  onCommit={(v) => setLook(track.id, round2(v), track.blur, { now: true })}
                />
                <span className="look-value">{Math.round(track.dim * 100)}%</span>
              </div>
              <div className="look-row">
                <span>Размытие</span>
                <GlassSlider
                  label="Размытие фона"
                  value={track.blur / MAX_BLUR}
                  onChange={(v) => setLook(track.id, track.dim, Math.round(v * MAX_BLUR))}
                  onCommit={(v) => setLook(track.id, track.dim, Math.round(v * MAX_BLUR), { now: true })}
                />
                <span className="look-value">{Math.round(track.blur)} px</span>
              </div>

              <div className="bg-footer">
                <button
                  className="link-btn"
                  disabled={lookIsDefault}
                  onClick={() => setLook(track.id, DEFAULT_DIM, DEFAULT_BLUR, { now: true })}
                >
                  Затемнение и размытие по умолчанию
                </button>
                <span className="muted">
                  {isCurrent ? "Песня играет — фон окна меняется вместе с ползунками." : "Во всё окно фон виден, когда играет эта песня."}
                </span>
              </div>
            </div>
          </div>
        </Section>

        {/* ---------- Текст песни ---------- */}
        <LyricsSection track={track} />
      </div>
    </div>
  );
}

const round2 = (v: number) => Math.round(v * 100) / 100;

async function resetInfo(id: string) {
  try {
    updateTrack(id, await trackApi.resetInfo(id));
    showToast("Название и исполнитель — снова из тегов файла");
  } catch (e) {
    showError(e);
  }
}

/** Форма: название, исполнитель, альбом. Меняется только библиотека, не файл. */
function InfoForm({ track, onClose }: { track: Track; onClose: () => void }) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist ?? "");
  const [album, setAlbum] = useState(track.album ?? "");
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await trackApi.updateInfo(track.id, title, artist, album);
      updateTrack(track.id, updated);
      const noLyrics = updated.lyrics === "none" || updated.lyrics === "notFound";
      showToast(noLyrics ? "Сохранено. Теперь можно снова поискать текст ниже" : "Сохранено");
      onClose();
    } catch (err) {
      showError(err);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  return (
    <form className="info-form" onSubmit={(e) => void save(e)} onKeyDown={onKeyDown}>
      <label>
        <span>Название</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
      </label>
      <label>
        <span>Исполнитель</span>
        <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Неизвестный исполнитель" />
      </label>
      <label>
        <span>Альбом</span>
        <input value={album} onChange={(e) => setAlbum(e.target.value)} placeholder="—" />
      </label>
      <div className="info-form-actions">
        <button type="submit" className="pill-btn pill-btn--accent" disabled={saving || !title.trim()}>
          {saving ? "Сохраняю…" : "Сохранить"}
        </button>
        <button type="button" className="pill-btn" onClick={onClose}>
          Отмена
        </button>
        <span className="muted info-note">Меняется только в библиотеке — файл на диске остаётся как был</span>
      </div>
    </form>
  );
}

/** Уменьшенная копия фона окна с примером текста — видно, читается ли он. */
function BackgroundPreview({ track }: { track: Track }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  const scale = width > 0 ? width / window.innerWidth : 0.3;
  return (
    <div ref={ref} className="bg-preview">
      <BackdropView track={track} scale={scale} className="backdrop--preview" />
      <div className="bg-preview-sample">
        <Cover src={track.coverSmall} seed={track.id} className="bg-preview-cover" />
        <div className="bg-preview-text">
          <div className="bg-preview-title">{track.title}</div>
          <div className="bg-preview-artist">{track.artist ?? "Неизвестный исполнитель"}</div>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  icon,
  title,
  status,
  full,
  children,
}: {
  /** Для быстрых переходов «Обложка · Фон · Текст песни» */
  id: string;
  icon: ReactNode;
  title: string;
  status?: string;
  /** Во всю ширину редактора */
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`editor-section glass-card ${full ? "editor-section--full" : ""}`}>
      <header className="section-head">
        <span className="section-icon">{icon}</span>
        <h3>{title}</h3>
        {status && <span className="chip">{status}</span>}
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}
