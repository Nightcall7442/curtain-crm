import { RATING_SCOPE_LABELS, RATING_SCOPES, type RatingScope } from '@curtain-crm/shared';
import type { ReactElement } from 'react';

import { useLocale } from '../hooks/useLocale';

import { SegmentedControl } from './SegmentedControl';

/**
 * Переключатель периода рейтинга «Неделя / Месяц».
 *
 * Один на оба экрана — «Рейтинг» и «Рейтинг сотрудников». Раньше у
 * соседних экранов был один и тот же выбор в двух видах: сегменты на
 * бежевой дорожке в одном и тёмные чипы в другом. Сами сегменты — общие
 * для приложения (`SegmentedControl`): тот же вид у типа запроса на
 * экране выходных.
 */
export function RatingScopeSwitch({
  value,
  onChange,
}: {
  readonly value: RatingScope;
  readonly onChange: (value: RatingScope) => void;
}): ReactElement {
  const { t } = useLocale();

  return (
    <SegmentedControl
      value={value}
      options={RATING_SCOPES.map((scope) => ({ value: scope, label: t(RATING_SCOPE_LABELS, scope) }))}
      onChange={onChange}
    />
  );
}
