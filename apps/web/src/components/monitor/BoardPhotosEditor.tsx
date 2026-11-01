'use client';

import {
  BOARD_PHOTO_KIND_LABELS,
  BOARD_PHOTO_KINDS,
  BoardPhotoKind,
  LiveStatus,
  MONITOR_GROUP_LABELS,
  MONITOR_GROUPS,
  ROLE_LABELS_RU,
  type BoardPhotoKind as BoardPhotoKindName,
  type LiveStatus as LiveStatusName,
} from '@curtain-crm/shared';
import { Camera, ImageOff, RefreshCw, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';

import { Card, CardHeader, ErrorState, Skeleton } from '@/components/ui/Card';
import { FormError } from '@/components/ui/Form';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { cn } from '@/lib/utils';

import { PersonPhoto } from './PersonPhoto';
import { STATUS_DOT } from './labels';

type BoardPerson = RouterOutputs['monitor']['photos']['list']['people'][number];

/** Тот же предел, что у фото сотрудника: снимок с телефона целиком. */
const MAX_PHOTO_MB = 15;

/** Цвет ячейки — цвет статуса на табло: директор сразу видит, где какое фото окажется. */
const KIND_STATUS: Readonly<Record<BoardPhotoKindName, LiveStatusName>> = {
  [BoardPhotoKind.WORKING]: LiveStatus.WORKING,
  [BoardPhotoKind.IDLE]: LiveStatus.IDLE,
  [BoardPhotoKind.BREAK]: LiveStatus.BREAK,
};

/** Когда какое фото на табло — подпись под ячейкой. */
const KIND_HINT: Readonly<Record<BoardPhotoKindName, string>> = {
  [BoardPhotoKind.WORKING]: 'за работой и на выезде',
  [BoardPhotoKind.IDLE]: 'без заказа и не на смене',
  [BoardPhotoKind.BREAK]: 'на перерыве',
};

/** Одна ячейка: фото статуса или место под него. */
function PhotoSlot({ person, kind }: { readonly person: BoardPerson; readonly kind: BoardPhotoKindName }): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const refresh = async (): Promise<void> => {
    await Promise.all([utils.monitor.photos.list.invalidate(), utils.monitor.board.invalidate()]);
  };
  const set = trpc.monitor.photos.set.useMutation({ onSuccess: refresh });
  const remove = trpc.monitor.photos.remove.useMutation({ onSuccess: refresh });
  const url = person.photos[kind];
  const busy = set.isPending || remove.isPending;
  const label = BOARD_PHOTO_KIND_LABELS.ru[kind];

  /*
    Файл читается в base64 здесь же, как фото сотрудника: tRPC возит JSON.
    Размер проверяется до чтения — узнать о пределе после загрузки десяти
    мегабайт обидно.
  */
  const upload = (file: File): void => {
    if (!file.type.startsWith('image/')) {
      setError('Нужен файл с фотографией');
      return;
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      setError(`Файл больше ${MAX_PHOTO_MB.toString()} МБ — уменьшите снимок`);
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setError('Не удалось прочитать файл');
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        setError('Не удалось прочитать файл');
        return;
      }
      set.mutate({
        userId: person.userId,
        kind,
        file: { fileName: file.name, mimeType: file.type, content: result.slice(result.indexOf(',') + 1) },
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="w-[118px] shrink-0 space-y-1.5">
      <div
        className={cn(
          'group relative aspect-[3/4] overflow-hidden rounded-xl border',
          url === null ? 'border-dashed border-ink/20 bg-ink/[0.03]' : 'border-ink/10',
        )}
      >
        {url === null ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-footnote text-muted transition-colors hover:bg-ink/[0.05] hover:text-primary"
            aria-label={`Загрузить фото «${label}» — ${person.fullName}`}
          >
            <Camera aria-hidden className="h-5 w-5" />
            {busy ? 'Загрузка…' : 'Загрузить'}
          </button>
        ) : (
          <>
            <img src={url} alt={`${person.fullName} — ${label}`} className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-6 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <button
                type="button"
                disabled={busy}
                onClick={() => input.current?.click()}
                className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-black hover:bg-white"
                aria-label={`Заменить фото «${label}» — ${person.fullName}`}
                title="Заменить"
              >
                <RefreshCw aria-hidden className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  remove.mutate({ userId: person.userId, kind });
                }}
                className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-danger hover:bg-white"
                aria-label={`Убрать фото «${label}» — ${person.fullName}`}
                title="Убрать"
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) upload(file);
            event.target.value = '';
          }}
        />
      </div>
      <p className="flex items-center gap-1.5 text-footnote font-semibold text-primary">
        <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[KIND_STATUS[kind]])} />
        {label}
      </p>
      <p className="text-overline text-muted">{KIND_HINT[kind]}</p>
      <FormError message={error ?? set.error?.message ?? remove.error?.message ?? null} />
    </div>
  );
}

function PersonRow({ person }: { readonly person: BoardPerson }): ReactElement {
  const filled = BOARD_PHOTO_KINDS.filter((kind) => person.photos[kind] !== null).length;

  return (
    <li className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-start">
      <div className="flex min-w-0 items-center gap-3 md:w-[240px] md:shrink-0">
        <PersonPhoto
          name={person.fullName}
          photoUrl={person.avatarUrl}
          variant="podium"
          noPhotoLabel=""
          className="h-12 w-12 shrink-0 rounded-full text-footnote"
        />
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-primary">{person.fullName}</p>
          <p className="truncate text-footnote text-muted">
            {person.roles.map((role) => ROLE_LABELS_RU[role]).join(', ')}
          </p>
          <p className={cn('mt-0.5 text-overline', filled === BOARD_PHOTO_KINDS.length ? 'text-positive' : 'text-muted')}>
            {`Фото табло: ${filled.toString()} из ${BOARD_PHOTO_KINDS.length.toString()}`}
          </p>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {BOARD_PHOTO_KINDS.map((kind) => (
          <PhotoSlot key={kind} person={person} kind={kind} />
        ))}
      </div>
    </li>
  );
}

/**
 * «Табло → Настройки»: фото людей табло по статусам.
 *
 * Заказчик (переписка 25.10): у каждого — фото «Работает», «Без заказа»,
 * «На перерыве»; табло показывает то, что соответствует статусу, а профиль
 * и остальная система — обычную аватарку.
 */
export function BoardPhotosEditor(): ReactElement {
  const list = trpc.monitor.photos.list.useQuery();

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-title font-semibold text-primary">Настройки табло</h1>
        <p className="max-w-[72ch] text-footnote text-secondary">
          Фото по статусам видны только на табло, в карточке человека на табло и на ТВ. В профиле, списке
          сотрудников и шапке остаётся обычное фото. Нет фото статуса — табло покажет обычное.
        </p>
      </header>

      {list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => void list.refetch()} />
      ) : list.data === undefined ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        MONITOR_GROUPS.map((group) => {
          const people = list.data.people.filter((person) => person.group === group);
          return (
            <Card key={group}>
              <CardHeader title={MONITOR_GROUP_LABELS.ru[group]} />
              {people.length === 0 ? (
                <p className="flex items-center gap-2 px-5 pb-5 text-footnote text-muted">
                  <ImageOff aria-hidden className="h-4 w-4" />
                  В этой группе табло никого нет
                </p>
              ) : (
                <ul className="divide-y divide-ink/[0.06]">
                  {people.map((person) => (
                    <PersonRow key={person.userId} person={person} />
                  ))}
                </ul>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
