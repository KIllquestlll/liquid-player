// Оформление трека: своя обложка, свой фон, затемнение и размытие.
import { open } from "@tauri-apps/plugin-dialog";
import { appearanceApi, type ImageKind, type Track } from "../lib/ipc";
import { showError, showToast } from "../ui/store";
import { updateTrack } from "./store";

/** Те же значения, что в appearance.rs */
export const DEFAULT_DIM = 0.45;
export const DEFAULT_BLUR = 40;
export const MAX_BLUR = 60;

/** Сильно размытому фону хватает уменьшенной картинки — экономия памяти видеокарты */
const SMALL_IMAGE_BLUR = 16;

export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "bmp", "gif"];

/** Выбрать картинку и поставить её обложкой или фоном. true — если поставили. */
export async function chooseImage(trackId: string, kind: ImageKind): Promise<boolean> {
  try {
    const file = await open({
      multiple: false,
      title: kind === "cover" ? "Выберите обложку" : "Выберите картинку для фона",
      filters: [{ name: "Картинки", extensions: IMAGE_EXTENSIONS }],
    });
    if (typeof file !== "string") return false;
    const track = await appearanceApi.setImage(trackId, kind, file);
    updateTrack(trackId, track);
    showToast(kind === "cover" ? "Обложка обновлена" : "Фон обновлён");
    return true;
  } catch (e) {
    showError(e);
    return false;
  }
}

export async function resetImage(trackId: string, kind: ImageKind) {
  try {
    const track = await appearanceApi.resetImage(trackId, kind);
    updateTrack(trackId, track);
    showToast(kind === "cover" ? "Вернули обложку из файла" : "Фон — снова размытая обложка");
  } catch (e) {
    showError(e);
  }
}

// Ползунки двигаются ~60 раз в секунду. Интерфейс обновляем сразу,
// а в базу пишем с задержкой 250 мс после последнего движения.
const saveTimers = new Map<string, number>();

export function setLook(trackId: string, dim: number, blur: number, { now = false } = {}) {
  updateTrack(trackId, { dim, blur });
  window.clearTimeout(saveTimers.get(trackId));
  const save = () => {
    saveTimers.delete(trackId);
    appearanceApi.setParams(trackId, dim, blur).catch(showError);
  };
  if (now) save();
  else saveTimers.set(trackId, window.setTimeout(save, 250));
}

/**
 * Какую картинку показывать фоном и надо ли её «оживлять» насыщенностью.
 * Свой фон — как есть; иначе обложка (сильно размытая выглядит как цветное облако).
 */
export function backdropSource(track: Track | undefined): { src: string | null; custom: boolean } {
  if (!track) return { src: null, custom: false };
  const heavy = track.blur >= SMALL_IMAGE_BLUR;
  if (track.background) {
    return { src: heavy ? (track.backgroundSmall ?? track.background) : track.background, custom: true };
  }
  return { src: heavy ? track.coverSmall : (track.cover ?? track.coverSmall), custom: false };
}
