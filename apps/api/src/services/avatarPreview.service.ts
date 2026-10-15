import { AVATAR_PREVIEW_MAX_PX } from '@curtain-crm/shared';
import sharp from 'sharp';

/**
 * Превью фото сотрудника для табло.
 *
 * Оригинал с телефона весит 1–3 МБ, а на экране табло их десять–двадцать
 * сразу, и на ТВ они перезапрашиваются каждый час. Превью — WebP не больше
 * `AVATAR_PREVIEW_MAX_PX` по длинной стороне: в карточке и на ТВ этого
 * хватает с запасом, а весит оно десятки килобайт.
 *
 * `rotate()` без аргументов поворачивает кадр по EXIF: фото с телефона
 * иначе ложилось бы набок. Маленькое фото не растягивается.
 *
 * Нечитаемый файл — не ошибка загрузки: сервер проверяет только заявленный
 * тип, и битая картинка до сих пор сохранялась как есть. Превью тогда нет,
 * табло покажет оригинал.
 */
export async function makeAvatarPreview(body: Uint8Array): Promise<Buffer | null> {
  try {
    return await sharp(body)
      .rotate()
      .resize({
        width: AVATAR_PREVIEW_MAX_PX,
        height: AVATAR_PREVIEW_MAX_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    return null;
  }
}
