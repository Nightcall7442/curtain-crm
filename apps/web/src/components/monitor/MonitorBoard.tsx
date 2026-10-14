'use client';

import {
  filterPeople,
  LIVE_STATUSES,
  MONITOR_GROUP_LABELS,
  MONITOR_SORTS,
  MonitorGroup,
  ROLE_LABELS_RU,
  Role,
  sortPeople,
  type MonitorGroup as MonitorGroupName,
  type MonitorSort,
} from '@curtain-crm/shared';
import { Search } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactElement } from 'react';

import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/Card';
import { Button, Input, Select } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

import { LiveIndicator } from './LiveIndicator';
import { PersonCard } from './PersonCard';
import { PersonDrawer } from './PersonDrawer';
import { Podium } from './Podium';
import { StatusChips, type StatusFilter } from './StatusChips';
import { SummaryPanel } from './SummaryPanel';
import { TripsToday } from './TripsToday';
import { useMonitorBoard } from './useMonitorBoard';

const SORT_LABELS: Readonly<Record<MonitorSort, string>> = { place: 'По месту', name: 'По имени' };

const EMPTY_GROUP: Readonly<Record<MonitorGroupName, string>> = {
  [MonitorGroup.WORKSHOP]: `В цехе пока нет швей: дайте сотруднику роль «${ROLE_LABELS_RU[Role.SEWER]}»`,
  [MonitorGroup.INSTALLATION]: `Пока нет выездных: дайте сотруднику роль «${ROLE_LABELS_RU[Role.INSTALLER]}» или «${ROLE_LABELS_RU[Role.CORNICE_INSTALLER]}»`,
};

const PEOPLE_TITLE: Readonly<Record<MonitorGroupName, string>> = {
  [MonitorGroup.WORKSHOP]: 'Швеи',
  [MonitorGroup.INSTALLATION]: 'Сотрудники',
};

/** Сетка карточек: столько колонок, сколько влезает по 232 px, — 5 на 1536, 1 на телефоне. */
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-3.5';

const parseSort = (value: string | null): MonitorSort =>
  MONITOR_SORTS.find((sort) => sort === value) ?? 'place';
const parseStatus = (value: string | null): StatusFilter =>
  LIVE_STATUSES.find((status) => status === value) ?? 'all';

/**
 * Страница табло «Цех» или «Установщики».
 *
 * Чтение адреса — под своей границей Suspense: `useSearchParams()` иначе
 * выключает статическую отрисовку страницы целиком (как в «Заказах»).
 */
export function MonitorBoardPage({ group }: { readonly group: MonitorGroupName }): ReactElement {
  return (
    <Suspense fallback={<BoardSkeleton group={group} />}>
      <MonitorBoard group={group} />
    </Suspense>
  );
}

function MonitorBoard({ group }: { readonly group: MonitorGroupName }): ReactElement {
  const params = useSearchParams();
  const pathname = usePathname();
  const status = parseStatus(params.get('status'));
  const sort = parseSort(params.get('sort'));
  const query = params.get('q') ?? '';
  const personParam = Number.parseInt(params.get('person') ?? '', 10);
  const personId = Number.isSafeInteger(personParam) && personParam > 0 ? personParam : null;

  const [branchId, setBranchId] = useState<number | null>(null);
  const branches = trpc.branches.list.useQuery();
  const { board, isLoading, isError, errorMessage, refetch, lastSuccessAt, stale } = useMonitorBoard(group, branchId);

  /**
   * Фильтр, сортировка и поиск живут в адресе: ссылкой «вот кто сейчас на
   * выезде» можно поделиться. Адрес меняется через `history.replaceState`:
   * Next подхватывает его в `useSearchParams`, а переход роутером на каждую
   * букву поиска запрашивал бы страницу у сервера заново.
   */
  const setParams = (changes: Readonly<Record<string, string | null>>): void => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    const search = next.toString();
    window.history.replaceState(null, '', search === '' ? pathname : `${pathname}?${search}`);
  };
  // Поле поиска своё, а не из адреса: адрес обновляется асинхронно, и курсор прыгал бы в конец.
  const [search, setSearch] = useState(query);

  const branchOptions = branches.data ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-title font-semibold text-primary">{MONITOR_GROUP_LABELS.ru[group]}</h1>
        {/* Отказ без данных — не «подключение…»: связь есть, табло закрыто. */}
        {!(board === null && isError) && <LiveIndicator lastSuccessAt={lastSuccessAt} stale={stale} />}
        {branchOptions.length > 1 && (
          <Select
            aria-label="Филиал"
            size="sm"
            className="ml-auto w-auto min-w-[180px]"
            value={branchId === null ? '' : branchId.toString()}
            onChange={(event) => {
              setBranchId(event.target.value === '' ? null : Number(event.target.value));
            }}
            placeholder="Все филиалы"
            options={branchOptions.map((branch) => ({ value: branch.id.toString(), label: branch.name }))}
          />
        )}
      </header>

      {board === null ? (
        isError && !isLoading ? (
          <Card>
            <ErrorState message={errorMessage ?? 'Табло не загрузилось'} onRetry={refetch} />
          </Card>
        ) : (
          <BoardBodySkeleton group={group} />
        )
      ) : board.summary.headcount === 0 ? (
        <Card>
          <EmptyState message={EMPTY_GROUP[group]} hint="Табло покажет людей, как только роль появится у сотрудника" />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Podium podium={board.podium} unit={board.unit} />
            <SummaryPanel board={board} />
          </div>

          <section aria-labelledby="people-title" className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="people-title" className="text-heading font-semibold text-primary">
                {PEOPLE_TITLE[group]}
              </h2>
              <StatusChips
                group={group}
                counts={board.statusCounts}
                total={board.people.length}
                value={status}
                onChange={(value) => {
                  setParams({ status: value === 'all' ? null : value });
                }}
              />
              <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
                <label className="relative min-w-0 flex-1 sm:w-[220px] sm:flex-none">
                  <span className="sr-only">Поиск по имени</span>
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                  />
                  <Input
                    type="search"
                    size="sm"
                    placeholder="Поиск по имени…"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setParams({ q: event.target.value.trim() });
                    }}
                    className="w-full pl-9"
                  />
                </label>
                <Select
                  aria-label="Сортировка"
                  size="sm"
                  className="w-auto"
                  value={sort}
                  onChange={(event) => {
                    setParams({ sort: event.target.value === 'place' ? null : event.target.value });
                  }}
                  options={MONITOR_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }))}
                />
              </div>
            </div>

            <div
              className={cn(
                group === MonitorGroup.INSTALLATION && 'grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_330px]',
              )}
            >
              <PeopleGrid
                group={group}
                board={board}
                status={status}
                sort={sort}
                query={query}
                onSelect={(userId) => {
                  setParams({ person: userId.toString() });
                }}
                onReset={() => {
                  setSearch('');
                  setParams({ status: null, q: null });
                }}
              />
              {group === MonitorGroup.INSTALLATION && <TripsToday trips={board.trips ?? []} />}
            </div>
          </section>
        </>
      )}

      <PersonDrawer
        userId={personId}
        onClose={() => {
          setParams({ person: null });
        }}
      />
    </div>
  );
}

function PeopleGrid({
  group,
  board,
  status,
  sort,
  query,
  onSelect,
  onReset,
}: {
  readonly group: MonitorGroupName;
  readonly board: NonNullable<ReturnType<typeof useMonitorBoard>['board']>;
  readonly status: StatusFilter;
  readonly sort: MonitorSort;
  readonly query: string;
  readonly onSelect: (userId: number) => void;
  readonly onReset: () => void;
}): ReactElement {
  const people = sortPeople(filterPeople(board.people, status, query), sort);

  if (people.length === 0) {
    return (
      <Card>
        <EmptyState
          message="Никого не нашлось"
          hint="Под выбранный статус и поиск сейчас никто не подходит"
          action={
            <Button variant="secondary" size="sm" onClick={onReset}>
              Показать всех
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className={GRID}>
      {people.map((person) => (
        <PersonCard key={person.userId} person={person} group={group} now={board.generatedAt} onSelect={onSelect} />
      ))}
    </div>
  );
}

/** Остов табло по форме страницы: пьедестал со сводкой, чипы, сетка карточек. */
function BoardBodySkeleton({ group }: { readonly group: MonitorGroupName }): ReactElement {
  return (
    <div className="space-y-5" aria-busy="true">
      <span className="sr-only">Загрузка табло</span>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="surface-card h-[340px]" />
        <div className="surface-card h-[340px]" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {['w-20', 'w-28', 'w-24', 'w-[88px]', 'w-28'].map((width, index) => (
          <Skeleton key={index} className={cn('h-[34px] rounded-full', width)} />
        ))}
      </div>
      <div className={cn(group === MonitorGroup.INSTALLATION && 'grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_330px]')}>
        <div className={GRID}>
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="surface-card h-[420px] overflow-hidden">
              <Skeleton className="h-[150px] w-full rounded-none" />
            </div>
          ))}
        </div>
        {group === MonitorGroup.INSTALLATION && <div className="surface-card h-[420px]" />}
      </div>
    </div>
  );
}

function BoardSkeleton({ group }: { readonly group: MonitorGroupName }): ReactElement {
  return (
    <div className="space-y-5">
      <h1 className="text-title font-semibold text-primary">{MONITOR_GROUP_LABELS.ru[group]}</h1>
      <BoardBodySkeleton group={group} />
    </div>
  );
}
