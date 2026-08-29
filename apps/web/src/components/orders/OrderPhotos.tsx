'use client';

import {
  AUTO_COMPLETE_PHOTO_STAGE,
  autoCompletesOnInstallPhoto,
  hasAnyRole,
  MANAGEMENT_ROLES,
  PHOTO_STAGE_LABELS_RU,
  PHOTO_STAGE_UPLOADER_ROLES,
  PHOTO_STAGES,
  type OrderStatus,
  type PhotoStage,
} from '@curtain-crm/shared';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui/Card';
import { Button, Field, FormError, Select } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';
import { formatDateTime } from '@/lib/utils';

/**
 * Фотофиксация этапов заказа.
 *
 * Файл уходит на сервер в base64 — tRPC работает поверх JSON. Предел размера
 * задан на сервере (`MAX_UPLOAD_SIZE_MB`), здесь он лишь проверяется заранее,
 * чтобы не гонять по сети файл, который всё равно будет отклонён.
 *
 * Загрузка фото стадии «После установки» автоматически закрывает заказ —
 * об этом предупреждаем ДО отправки, потому что действие необратимо.
 */
const MAX_CLIENT_SIZE_MB = 15;

export function OrderPhotos({
  orderId,
  orderStatus,
}: {
  readonly orderId: number;
  /** Статус заказа: от него зависит, закроет ли загрузка фото заказ. */
  readonly orderStatus: OrderStatus;
}): ReactElement {
  const { user } = useAuth();
  const roles = user?.roles ?? [];

  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<PhotoStage>('general');
  const [localError, setLocalError] = useState<string | null>(null);

  const photos = trpc.orderPhotos.listByOrder.useQuery({ orderId });

  const upload = trpc.orderPhotos.upload.useMutation({
    async onSuccess(result) {
      setLocalError(null);
      await utils.orderPhotos.listByOrder.invalidate({ orderId });

      // Автозакрытие меняет статус заказа — обновляем всё, что от него зависит.
      if (result.autoCompleted) {
        await Promise.all([
          utils.orders.byId.invalidate({ id: orderId }),
          utils.orders.availableTransitions.invalidate({ id: orderId }),
          utils.orders.history.invalidate({ id: orderId }),
          utils.orders.list.invalidate(),
        ]);
      }
    },
  });

  const remove = trpc.orderPhotos.remove.useMutation({
    async onSuccess() {
      await utils.orderPhotos.listByOrder.invalidate({ orderId });
    },
  });

  /** Стадии, на которые этот сотрудник вправе загружать фото. */
  const allowedStages = PHOTO_STAGES.filter((value) =>
    hasAnyRole(roles, PHOTO_STAGE_UPLOADER_ROLES[value]),
  );

  // Правило автозакрытия — общее с сервером: предупреждение и фактический
  // переход не должны расходиться.
  const willAutoComplete =
    stage === AUTO_COMPLETE_PHOTO_STAGE && autoCompletesOnInstallPhoto(orderStatus);

  const handleFile = (file: File): void => {
    setLocalError(null);

    if (!file.type.startsWith('image/')) {
      setLocalError('Можно загружать только изображения');
      return;
    }

    if (file.size > MAX_CLIENT_SIZE_MB * 1024 * 1024) {
      setLocalError(`Файл больше ${MAX_CLIENT_SIZE_MB.toString()} МБ`);
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => {
      setLocalError('Не удалось прочитать файл');
    };

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        setLocalError('Не удалось прочитать файл');
        return;
      }

      // `readAsDataURL` даёт `data:image/jpeg;base64,…` — сервер такой
      // префикс срезает сам, но отправлять лишние байты незачем.
      const base64 = result.slice(result.indexOf(',') + 1);

      upload.mutate({
        orderId,
        stage,
        file: { fileName: file.name, mimeType: file.type, content: base64 },
      });
    };

    reader.readAsDataURL(file);
  };

  return (
    <Card>
      <CardHeader
        title="Фотофиксация"
        action={
          allowedStages.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Стадия" className="w-52">
                <Select
                  value={stage}
                  onChange={(event) => {
                    setStage(event.target.value as PhotoStage);
                  }}
                  options={allowedStages.map((value) => ({
                    value,
                    label: PHOTO_STAGE_LABELS_RU[value],
                  }))}
                />
              </Field>

              <Button
                loading={upload.isPending}
                onClick={() => {
                  inputRef.current?.click();
                }}
              >
                <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                Загрузить фото
              </Button>

              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file !== undefined) handleFile(file);
                  // Сбрасываем значение, иначе повторный выбор того же файла
                  // не вызовет `change`.
                  event.target.value = '';
                }}
              />
            </div>
          )
        }
      />

      <CardBody>
        {willAutoComplete && (
          <p className="mb-3 rounded border border-warning/30 bg-warning/10 px-3 py-2 text-footnote text-warning">
            Фото стадии «После установки» автоматически закроет заказ.
            Отменить закрытие сможет только руководство.
          </p>
        )}

        <FormError message={localError ?? upload.error?.message ?? null} />

        {upload.data?.autoCompleted === true && (
          <p className="mb-3 rounded border border-positive/30 bg-positive/10 px-3 py-2 text-footnote text-positive">
            Заказ закрыт автоматически после загрузки фото.
          </p>
        )}

        {photos.isLoading ? (
          <Skeleton className="h-32" />
        ) : photos.data === undefined || photos.data.length === 0 ? (
          <EmptyState
            message="Фотографий пока нет"
            hint={
              allowedStages.length === 0
                ? 'Загружать фото по этому заказу могут другие исполнители'
                : 'Выберите стадию и загрузите снимок'
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.data.map((photo) => (
              <li key={photo.id} className="overflow-hidden rounded border border-subtle bg-base/40">
                {/* Обычный img, а не next/image: файлы отдаёт наш API по
                    подписанным ссылкам с ограниченным сроком жизни, и
                    оптимизатор Next не смог бы их закешировать. */}
                <img
                  src={photo.url}
                  alt={`${PHOTO_STAGE_LABELS_RU[photo.stage]} — ${photo.uploadedByName}`}
                  className="h-32 w-full object-cover"
                  loading="lazy"
                />

                <div className="p-2">
                  <p className="text-footnote text-accent">
                    {PHOTO_STAGE_LABELS_RU[photo.stage]}
                  </p>
                  <p className="truncate text-overline text-muted">{photo.uploadedByName}</p>
                  <p className="text-overline text-muted">{formatDateTime(photo.createdAt)}</p>

                  {(photo.uploadedBy === user?.id || hasAnyRole(roles, MANAGEMENT_ROLES)) && (
                    <button
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => {
                        remove.mutate({ id: photo.id });
                      }}
                      className="mt-1 flex items-center gap-1 text-overline text-muted transition-colors hover:text-danger disabled:opacity-40"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                      Удалить
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
