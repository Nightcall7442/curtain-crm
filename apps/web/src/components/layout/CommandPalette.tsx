'use client';

import { formatPhone, ROLE_LABELS_RU, ORDER_STATUS_LABELS_RU } from '@curtain-crm/shared';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

/**
 * Глобальный поиск по Ctrl+K (ревизия «Диспетчерская», П2).
 *
 * Сценарий — «звонит клиент»: диспетчеру нужно найти заказ за секунды из
 * любого раздела, по номеру, имени или телефону. Заказы ищутся включая
 * архив — звонят и по закрытым. Руководству вторым блоком ищутся
 * сотрудники; рядовым — нет, у них и раздела такого нет.
 *
 * Поиск выполняет СЕРВЕР теми же процедурами, что и списки: `orders.list`
 * вернёт рядовому сотруднику только его заказы, какую строку ни введи.
 */
export function CommandPalette({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactElement | null {
  const router = useRouter();
  const { isManagement } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);

  // Пауза в 250 мс между нажатием и запросом: искать на каждую букву —
  // это шесть лишних запросов на слово «Малика».
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim());
    }, 250);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setDebounced('');
      setActive(0);
      // Фокус после отрисовки: пока панель скрыта, фокусировать нечего.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const enabled = open && debounced.length >= 2;

  const orders = trpc.orders.list.useQuery(
    { page: 1, pageSize: 6, search: debounced, includeArchived: true },
    { enabled, placeholderData: (previous) => previous },
  );
  const employees = trpc.users.list.useQuery(
    { page: 1, pageSize: 5, search: debounced },
    { enabled: enabled && isManagement, placeholderData: (previous) => previous },
  );

  interface Item {
    readonly key: string;
    readonly group: 'Заказы' | 'Сотрудники';
    readonly title: string;
    readonly hint: string;
    readonly href: string;
  }

  const items = useMemo<readonly Item[]>(() => {
    if (!enabled) return [];

    const orderItems: Item[] = (orders.data?.items ?? []).map((order) => ({
      key: `order-${order.id.toString()}`,
      group: 'Заказы',
      title: `${order.orderNumber ?? `#${order.id.toString()}`} · ${order.clientName}`,
      hint: `${ORDER_STATUS_LABELS_RU[order.status]} · ${formatPhone(order.clientPhone)}`,
      href: `/orders/${order.id.toString()}`,
    }));

    const employeeItems: Item[] = (employees.data?.items ?? []).map((person) => ({
      key: `user-${person.id.toString()}`,
      group: 'Сотрудники',
      title: person.fullName,
      hint: `${person.roles.map((role) => ROLE_LABELS_RU[role]).join(', ')} · ${formatPhone(person.phone)}`,
      // Раздел откроется с уже введённым поиском — карточки сотрудника
      // как отдельной страницы в системе нет.
      href: `/employees?search=${encodeURIComponent(person.fullName)}`,
    }));

    return [...orderItems, ...employeeItems];
  }, [enabled, orders.data, employees.data]);

  // Курсор не должен указывать за конец списка после смены результатов.
  const activeIndex = Math.min(active, Math.max(0, items.length - 1));

  const go = (item: Item | undefined): void => {
    if (item === undefined) return;
    onClose();
    router.push(item.href);
  };

  if (!open) return null;

  const isSearching = enabled && (orders.isFetching || employees.isFetching);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Поиск по системе"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActive((current) => Math.min(items.length - 1, current + 1));
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActive((current) => Math.max(0, current - 1));
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          go(items[activeIndex]);
        }
      }}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-tile border border-subtle bg-panel shadow-xl"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-subtle px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <input
            ref={inputRef}
            // rAF-фокус в эффекте страхует повторные открытия; `autoFocus` —
            // первый монтаж: в фоновых вкладках rAF может быть придушен.
            // Для модального поиска фокус на вводе — ожидаемое поведение.
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            placeholder={
              isManagement
                ? 'Номер заказа, клиент, телефон или сотрудник'
                : 'Номер заказа, клиент или телефон'
            }
            aria-label="Строка поиска"
            className="min-w-0 flex-1 bg-transparent text-caption text-primary outline-none placeholder:text-muted"
          />
          <kbd className="rounded border border-subtle bg-base px-1.5 py-0.5 font-mono text-[10px] text-muted">
            Esc
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {debounced.length < 2 ? (
            <p className="px-4 py-6 text-center text-footnote text-muted">
              Введите хотя бы две буквы или цифры
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-center text-footnote text-muted">
              {isSearching ? 'Ищем…' : 'Ничего не найдено'}
            </p>
          ) : (
            <ul className="py-1.5">
              {items.map((item, index) => {
                const showGroup = index === 0 || items[index - 1]?.group !== item.group;
                return (
                  <li key={item.key}>
                    {showGroup && (
                      <p className="px-4 pb-1 pt-2.5 text-overline font-semibold uppercase tracking-wide text-muted">
                        {item.group}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        go(item);
                      }}
                      onMouseEnter={() => {
                        setActive(index);
                      }}
                      className={cn(
                        'flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left',
                        index === activeIndex ? 'bg-accent-soft/70' : 'hover:bg-raised/60',
                      )}
                    >
                      <span className="min-w-0 truncate text-caption text-primary">
                        {item.title}
                      </span>
                      <span className="shrink-0 text-footnote text-muted">{item.hint}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
