'use client';

import {
  CATALOG_KIND_LABELS_RU,
  CATALOG_KINDS,
  type CatalogKind,
} from '@curtain-crm/shared';
import { EyeOff, Eye, ListTree, Pencil, Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui/Card';
import { Button, Field, FormError, Input, Modal } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

/**
 * Справочники характеристик заказа.
 *
 * Позиции не удаляются, а выводятся из обращения: заказы хранят выбранное
 * значение текстом, но исчезнувшая из справочника позиция ломает аналитику
 * по моделям и материалам.
 */
export function CatalogManager(): ReactElement {
  const [kind, setKind] = useState<CatalogKind>('curtain_model');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');

  const utils = trpc.useUtils();
  const list = trpc.catalog.list.useQuery({ kind, includeInactive: true });

  const refresh = async (): Promise<void> => {
    await utils.catalog.list.invalidate();
  };

  const close = (): void => {
    setDialogOpen(false);
    setEditingId(null);
    setName('');
    setSortOrder('0');
    create.reset();
    update.reset();
  };

  const create = trpc.catalog.create.useMutation({
    async onSuccess() {
      await refresh();
      close();
    },
  });

  const update = trpc.catalog.update.useMutation({
    async onSuccess() {
      await refresh();
      close();
    },
  });

  const setActive = trpc.catalog.setActive.useMutation({ onSuccess: refresh });

  return (
    <Card>
      <CardHeader
        title="Справочники характеристик заказа"
        icon={<ListTree className="h-4 w-4" />}
        level={3}
        action={
          <Button
            icon={<Plus className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => {
              setEditingId(null);
              setName('');
              setSortOrder('0');
              setDialogOpen(true);
            }}
          >
            Добавить позицию
          </Button>
        }
      />

      <CardBody className="space-y-4">
        {/*
          Справочники переключаются рядом кнопок, а не выпадающим списком.

          Список прятал восемь справочников за одним значением и стоял в шапке,
          на другом конце карточки от того, что он меняет: связь между «Модель
          штор» справа вверху и чипами слева внизу приходилось угадывать. Здесь
          все восемь видны сразу, выбранный подсвечен, и переход между ними —
          одно нажатие вместо трёх.

          Выбранный — тёмная хвоя, а не акцент: акцентом в панели красятся
          ДЕЙСТВИЯ, и залитая им кнопка читается как «сейчас что-то произойдёт».
          Здесь же лишь меняется то, что показано ниже. То же правило и в
          мобильном приложении, у фильтров списка заказов.
        */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Справочник">
          {CATALOG_KINDS.map((value) => {
            const active = value === kind;

            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setKind(value);
                }}
                className={cn(
                  'pressable h-8 rounded-tile border px-3 text-footnote font-medium',
                  active
                    ? 'border-nav bg-nav text-nav-text'
                    : 'border-subtle bg-panel text-secondary hover:bg-raised hover:text-primary',
                )}
              >
                {CATALOG_KIND_LABELS_RU[value]}
              </button>
            );
          })}
        </div>

        <p className="text-footnote text-muted">
          Эти значения предлагаются в форме заказа. Нажатие на позицию
          переименовывает её, кнопка с глазом — выводит из обращения: выведенные
          не показываются продавцу, но остаются в старых заказах.
        </p>

        {list.isLoading ? (
          <Skeleton className="h-20" />
        ) : list.data === undefined || list.data.length === 0 ? (
          <EmptyState message="В этом справочнике пока пусто" hint="Добавьте первую позицию" />
        ) : (
          /*
            Позиция справочника — не «текст с двумя значками сбоку», а пара
            кнопок в общей обойме: имя переименовывает, глаз выводит из
            обращения. Прежние значки были 12 пикселей и стояли внутри чипа
            высотой 24 — попасть по ним мышью получалось не с первого раза, а
            на сенсорном экране почти никогда (порог WCAG 2.2 — 24 px).

            Теперь обойма 32 пикселя в высоту, имя занимает всю свою половину
            целиком, кнопка глаза — квадрат 32×32, между ними разделительная
            линия. Карандаш приглушён и проявляется при наведении: он лишь
            подсказка, что имя нажимается, а не самостоятельная цель.
          */
          <ul className="flex flex-wrap gap-2">
            {list.data.map((item) => (
              <li
                key={item.id}
                className={cn(
                  'group flex h-8 items-center overflow-hidden rounded-tile border',
                  item.isActive
                    ? 'border-accent/30 bg-accent-soft'
                    : 'border-subtle bg-base/50',
                )}
              >
                <button
                  type="button"
                  aria-label={`Переименовать «${item.name}»`}
                  onClick={() => {
                    setEditingId(item.id);
                    setName(item.name);
                    setSortOrder(item.sortOrder.toString());
                    setDialogOpen(true);
                  }}
                  className={cn(
                    'flex h-full items-center gap-1.5 px-3 text-footnote font-medium transition-colors',
                    item.isActive
                      ? 'text-accent-strong hover:bg-accent/10'
                      : 'text-muted hover:bg-raised hover:text-secondary',
                  )}
                >
                  <span className={item.isActive ? undefined : 'line-through'}>{item.name}</span>
                  <Pencil
                    aria-hidden
                    className="h-3 w-3 shrink-0 opacity-45 transition-opacity group-hover:opacity-100"
                  />
                </button>

                <span
                  aria-hidden
                  className={cn('h-full w-px', item.isActive ? 'bg-accent/20' : 'bg-subtle')}
                />

                <button
                  type="button"
                  aria-label={
                    item.isActive
                      ? `Вывести «${item.name}» из обращения`
                      : `Вернуть «${item.name}» в обращение`
                  }
                  disabled={setActive.isPending}
                  onClick={() => {
                    setActive.mutate({ id: item.id, isActive: !item.isActive });
                  }}
                  className={cn(
                    'grid h-full w-8 shrink-0 place-items-center transition-colors disabled:opacity-40',
                    item.isActive
                      ? 'text-accent/70 hover:bg-accent/10 hover:text-accent-strong'
                      : 'text-muted hover:bg-raised hover:text-primary',
                  )}
                >
                  {item.isActive ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      <Modal
        open={dialogOpen}
        title={editingId === null ? 'Новая позиция справочника' : 'Правка позиции'}
        onClose={close}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Отмена
            </Button>
            <Button
              loading={create.isPending || update.isPending}
              disabled={name.trim().length === 0}
              onClick={() => {
                const order = Number.parseInt(sortOrder, 10) || 0;
                if (editingId === null) {
                  create.mutate({ kind, name: name.trim(), sortOrder: order });
                } else {
                  update.mutate({ id: editingId, name: name.trim(), sortOrder: order });
                }
              }}
            >
              Сохранить
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError message={create.error?.message ?? update.error?.message ?? null} />

          <Field label="Справочник">
            <Input value={CATALOG_KIND_LABELS_RU[kind]} disabled readOnly />
          </Field>

          <Field label="Название" required>
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              placeholder="Например: Римские"
            />
          </Field>

          <Field label="Порядок в списке" hint="Меньше — выше">
            <Input
              type="number"
              min={0}
              value={sortOrder}
              onChange={(event) => {
                setSortOrder(event.target.value);
              }}
            />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}
