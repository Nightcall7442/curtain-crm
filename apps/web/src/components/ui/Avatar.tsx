'use client';

import { useState, type ReactElement } from 'react';

import { initials } from '@/lib/utils';

/**
 * Фото сотрудника, а без него — инициалы.
 *
 * Обычный <img>, а не next/image: адрес приходит из хранилища и меняется
 * вместе с драйвером, а оптимизатору Next нужен заранее известный список
 * источников. Если файл не открылся (удалён, истекла подпись ссылки) —
 * тоже инициалы: сломанная картинка браузера в списке выглядит как поломка.
 */
export function Avatar({
  url,
  fullName,
}: {
  readonly url: string | null;
  readonly fullName: string;
}): ReactElement {
  const [broken, setBroken] = useState(false);

  if (url !== null && !broken) {
    return (
      <img
        src={url}
        alt=""
        onError={() => {
          setBroken(true);
        }}
        className="h-8 w-8 shrink-0 rounded-full border border-ink/10 object-cover object-top"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink/[0.08] text-overline font-medium text-secondary"
    >
      {initials(fullName)}
    </span>
  );
}
