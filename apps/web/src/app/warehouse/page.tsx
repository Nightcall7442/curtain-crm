'use client';

import { STOCK_KIND_LABELS_RU, STOCK_KINDS, type StockKind } from '@curtain-crm/shared';
import { Download, FileText, Plus, Upload } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';

import { useToast } from '@/components/providers/ToastProvider';
import { Card, CardHeader, ErrorState } from '@/components/ui/Card';
import { Button, Field, fieldErrors, FormError, Input, Modal, Select } from '@/components/ui/Form';
import { DataTable } from '@/components/ui/Table';
import { exportToXlsx, readXlsx } from '@/lib/spreadsheet';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

/**
 * Склад: какие коды бывают и что за ними стоит.
 *
 * Метров здесь нет намеренно. Учёт остатков не поспевал за полкой: колонка
 * показывала минусы там, где ткань просто не успели завести, и владелец
 * попросил убрать приход, расход и списание совсем. Осталось то, ради чего
 * склад открывают каждый день, — код с бирки и мини-описание к нему: что это
 * за материал и чем эта партия отличается от такой же.
 *
 * Тот же список продавец видит в заказе, когда вводит код, поэтому справочник
 * и склад — одно место, а не два похожих.
 */

/** Виды, которые лежат на складе. Модели, цвета и прочее — в настройках. */
const KIND_SET = new Set<string>(STOCK_KINDS);

const HEADERS = ['Код', 'Вид', 'Описание'] as const;

/** «Портьера» из файла обратно в вид справочника. Регистр не важен. */
const KIND_BY_LABEL = new Map<string, StockKind>(
  STOCK_KINDS.map((kind) => [STOCK_KIND_LABELS_RU[kind].toLowerCase(), kind]),
);

const today = (): string => new Date().toISOString().slice(0, 10);

export default function WarehousePage(): ReactElement {
  const toast = useToast();
  const utils = trpc.useUtils();

  const [formOpen, setFormOpen] = useState(false);
  /** Код, который правят. `null` — заводится новый. */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [kind, setKind] = useState<StockKind>('portiere_code');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockKind | 'all'>('all');
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  const rows = trpc.catalog.list.useQuery({ includeInactive: true });

  const refresh = (): void => {
    void utils.catalog.list.invalidate();
  };

  const closeForm = (): void => {
    setFormOpen(false);
    setEditingId(null);
    setCode('');
    setDescription('');
  };

  const create = trpc.catalog.create.useMutation({
    onSuccess(row) {
      closeForm();
      toast.success('Код заведён', row.name);
      refresh();
    },
    onError: (error) => {
      toast.error('Не удалось завести код', error.message);
    },
  });

  const update = trpc.catalog.update.useMutation({
    onSuccess(row) {
      closeForm();
      toast.success('Сохранено', row.name);
      refresh();
    },
    onError: (error) => {
      toast.error('Не удалось сохранить', error.message);
    },
  });

  const setActive = trpc.catalog.setActive.useMutation({
    onSuccess(row) {
      toast.success(row.isActive ? 'Код вернулся в работу' : 'Код выведен из обращения', row.name);
      refresh();
    },
    onError: (error) => {
      toast.error('Не удалось изменить', error.message);
    },
  });

  const importItems = trpc.catalog.importItems.useMutation({
    onSuccess(result) {
      toast.success(
        'Файл загружен',
        `Новых кодов: ${String(result.created)}, дополнено описаний: ${String(result.updated)}`,
      );
      refresh();
    },
    onError: (error) => {
      toast.error('Не удалось загрузить файл', error.message);
    },
  });

  if (rows.isError) {
    return (
      <Card>
        <ErrorState
          message={rows.error.message}
          onRetry={() => {
            void rows.refetch();
          }}
        />
      </Card>
    );
  }

  const all = (rows.data ?? []).filter((row) => KIND_SET.has(row.kind));
  const needle = search.trim().toLowerCase();

  const visible = all.filter((row) => {
    const byKind = filter === 'all' || row.kind === filter;
    const byText =
      needle === '' ||
      [row.name, row.description ?? ''].some((field) => field.toLowerCase().includes(needle));
    return byKind && byText;
  });

  const sheetRows = visible.map((row) => [
    row.name,
    STOCK_KIND_LABELS_RU[row.kind as StockKind],
    row.description ?? '',
  ]);

  const errors = fieldErrors(editingId === null ? create.error : update.error);

  const openNew = (): void => {
    create.reset();
    update.reset();
    closeForm();
    setFormOpen(true);
  };

  const runExport = (): void => {
    setBusy('export');

    void exportToXlsx({
      fileName: `sklad-${today()}.xlsx`,
      sheetName: 'Склад',
      headers: HEADERS,
      rows: sheetRows,
    })
      .then(() => {
        toast.success('Файл сохранён', `Строк: ${String(sheetRows.length)}`);
      })
      .catch((error: unknown) => {
        toast.error('Не удалось выгрузить', error instanceof Error ? error.message : 'Ошибка');
      })
      .finally(() => {
        setBusy(null);
      });
  };

  /*
    PDF печатает сам браузер: «Сохранить как PDF» в его окне печати.

    Своя сборка PDF потребовала бы зашитого шрифта с кириллицей ради того же
    листа, который браузер верстает сам, — и который заодно сразу уходит на
    принтер, за чем в цехе к документу и приходят.
  */
  const runPrint = (): void => {
    window.print();
  };

  const runImport = (file: File): void => {
    setBusy('import');

    void readXlsx(file)
      .then((table) => {
        const items: { kind: StockKind; name: string; description: string | null }[] = [];
        const skipped: string[] = [];

        for (const row of table) {
          const name = (row[0] ?? '').trim();
          const label = (row[1] ?? '').trim().toLowerCase();
          if (name === '') continue;

          const rowKind = KIND_BY_LABEL.get(label);
          if (rowKind === undefined) {
            skipped.push(name);
            continue;
          }

          const text = (row[2] ?? '').trim();
          items.push({ kind: rowKind, name, description: text === '' ? null : text });
        }

        if (items.length === 0) {
          toast.error('В файле нечего загружать', 'Нужны колонки «Код» и «Вид» — как в выгрузке');
          return;
        }

        if (skipped.length > 0) {
          toast.error(
            `Пропущено строк: ${String(skipped.length)}`,
            `Непонятный вид у кодов: ${skipped.slice(0, 5).join(', ')}`,
          );
        }

        importItems.mutate({ items });
      })
      .catch((error: unknown) => {
        toast.error('Не удалось прочитать файл', error instanceof Error ? error.message : 'Ошибка');
      })
      .finally(() => {
        setBusy(null);
      });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Склад"
          action={
            <span className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                loading={busy === 'export'}
                disabled={visible.length === 0}
                icon={<Download className="h-3.5 w-3.5" aria-hidden />}
                onClick={runExport}
              >
                Excel
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={visible.length === 0}
                icon={<FileText className="h-3.5 w-3.5" aria-hidden />}
                onClick={runPrint}
              >
                PDF
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === 'import' || importItems.isPending}
                icon={<Upload className="h-3.5 w-3.5" aria-hidden />}
                onClick={() => {
                  fileInput.current?.click();
                }}
              >
                Импорт
              </Button>
              <Button
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" aria-hidden />}
                onClick={openNew}
              >
                Позиция
              </Button>
            </span>
          }
        />

        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xlsm"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Значение сбрасывается, иначе тот же файл второй раз не выберется.
            event.target.value = '';
            if (file !== undefined) runImport(file);
          }}
        />

        <div className="space-y-3 px-4 pb-3">
          {/* Виды — рядом кнопок, как справочники в настройках. */}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Вид материала">
            {(['all', ...STOCK_KINDS] as const).map((value) => {
              const active = value === filter;

              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setFilter(value);
                  }}
                  className={cn(
                    'pressable h-8 rounded-tile border px-3 text-footnote font-medium',
                    active
                      ? 'border-nav bg-nav text-nav-text'
                      : 'border-subtle bg-panel text-secondary hover:bg-white/[0.08] hover:text-primary',
                  )}
                >
                  {value === 'all' ? 'Все' : STOCK_KIND_LABELS_RU[value]}
                </button>
              );
            })}
          </div>

          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Поиск по коду или описанию"
          />

          <p className="text-footnote text-muted">
            Эти коды продавец вводит в заказе и сразу видит описание. Excel и печать выгружают то,
            что показано: с выбранным видом и поиском.
          </p>
        </div>

        <DataTable
          isLoading={rows.isLoading}
          rows={visible}
          rowKey={(row) => row.id}
          emptyMessage={
            all.length === 0 ? 'Склад пуст — заведите первый код' : 'По этому запросу ничего нет'
          }
          emptyAction={
            all.length === 0 ? (
              <Button size="sm" onClick={openNew}>
                Завести код
              </Button>
            ) : undefined
          }
          columns={[
            {
              key: 'code',
              header: 'Код',
              sortValue: (row) => row.name,
              render: (row) => (
                <span className={row.isActive ? 'text-primary' : 'text-muted line-through'}>
                  {row.name}
                </span>
              ),
            },
            {
              key: 'kind',
              header: 'Вид',
              sortValue: (row) => row.kind,
              render: (row) => STOCK_KIND_LABELS_RU[row.kind as StockKind],
            },
            {
              key: 'description',
              header: 'Описание',
              sortValue: (row) => row.description ?? '',
              render: (row) =>
                row.description === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span className="text-secondary">{row.description}</span>
                ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => (
                <span className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      create.reset();
                      update.reset();
                      setEditingId(row.id);
                      setKind(row.kind as StockKind);
                      setCode(row.name);
                      setDescription(row.description ?? '');
                      setFormOpen(true);
                    }}
                  >
                    Изменить
                  </Button>
                  {/*
                    Код не удаляют: он записан текстом в старых заказах.
                    Выведенный не показывается продавцу, но остаётся в истории.
                  */}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setActive.mutate({ id: row.id, isActive: !row.isActive });
                    }}
                  >
                    {row.isActive ? 'Вывести' : 'Вернуть'}
                  </Button>
                </span>
              ),
            },
          ]}
        />
      </Card>

      {/*
        Лист для печати: то же, что на экране, но без панели и кнопок.
        Браузер сохраняет его в PDF или отправляет на принтер.
      */}
      <div id="print-area" className="print-sheet">
        <h1>Склад — коды материалов и аксессуаров</h1>
        <p>
          {filter === 'all' ? 'Все виды' : STOCK_KIND_LABELS_RU[filter]}
          {needle === '' ? '' : ` · поиск: ${search.trim()}`} · {today()}
        </p>
        <table>
          <thead>
            <tr>
              {HEADERS.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheetRows.map((row) => (
              <tr key={row.join('|')}>
                {row.map((cell, index) => (
                  <td key={HEADERS[index]}>{cell === '' ? '—' : cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={formOpen}
        title={editingId === null ? 'Новый код' : 'Правка кода'}
        onClose={closeForm}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Отмена
            </Button>
            <Button
              loading={create.isPending || update.isPending}
              disabled={code.trim() === ''}
              onClick={() => {
                const card = {
                  name: code.trim(),
                  description: description.trim() === '' ? null : description.trim(),
                };

                if (editingId === null) {
                  create.mutate({ ...card, kind });
                } else {
                  update.mutate({ id: editingId, ...card });
                }
              }}
            >
              {editingId === null ? 'Завести' : 'Сохранить'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError
            message={
              editingId === null
                ? create.error !== null && Object.keys(errors).length === 0
                  ? create.error.message
                  : null
                : update.error !== null && Object.keys(errors).length === 0
                  ? update.error.message
                  : null
            }
          />

          {/* Вид у заведённого кода не меняется: это другой справочник. */}
          {editingId === null && (
            <Field label="Что это" required>
              <Select
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as StockKind);
                }}
                options={STOCK_KINDS.map((value) => ({
                  value,
                  label: STOCK_KIND_LABELS_RU[value],
                }))}
              />
            </Field>
          )}

          <Field label="Код с бирки" required error={errors['name']}>
            <Input
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
              placeholder="Например: П-31"
            />
          </Field>

          <Field
            label="Мини-описание"
            hint="Что это за материал: оттенок, плотность, размер"
            error={errors['description']}
          >
            <Input
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
              placeholder="Например: тёмная сторона, плотный блэкаут"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
