'use client';

import {
  formatDateTime,
  LOCALE_INFO,
  LOCALES,
  MONITOR_GROUP_LABELS,
  MonitorGroup,
  type Locale,
} from '@curtain-crm/shared';
import { Check, Copy, Plus, Tv } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import QRCode from 'react-qr-code';

import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui/Card';
import { Button, Field, fieldErrors, FormError, Input, Modal, Select } from '@/components/ui/Form';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { cn } from '@/lib/utils';

type DisplayLink = RouterOutputs['displayLinks']['list'][number];

/** «был на связи 5 мин назад»: табло опрашивает сервер раз в 20 с, отметка — с точностью до минуты. */
function seenText(lastSeenAt: Date | null, now: number): string {
  if (lastSeenAt === null) return 'ещё не открывали';
  const minutes = Math.floor((now - lastSeenAt.getTime()) / 60_000);
  if (minutes < 2) return 'на связи сейчас';
  if (minutes < 60) return `был на связи ${minutes.toString()} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `был на связи ${hours.toString()} ч назад`;
  return `был на связи ${formatDateTime(lastSeenAt, false)}`;
}

const boardsText = (link: Pick<DisplayLink, 'showWorkshop' | 'showInstallation'>): string =>
  [
    link.showWorkshop ? MONITOR_GROUP_LABELS.ru[MonitorGroup.WORKSHOP] : null,
    link.showInstallation ? MONITOR_GROUP_LABELS.ru[MonitorGroup.INSTALLATION] : null,
  ]
    .filter((part) => part !== null)
    .join(' и ');

const localeOf = (value: string): Locale => LOCALES.find((locale) => locale === value) ?? 'ru';

/** Адрес и QR новой ссылки: сервер хранит только хеш, поэтому показать их можно один раз. */
function CreatedLink({ url }: { readonly url: string }): ReactElement {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-warning/30 bg-warning/[0.08] px-3 py-2 text-footnote text-warning">
        Адрес показывается один раз. Откройте его на телевизоре или сохраните — потом его не узнать, можно
        только создать новую ссылку.
      </p>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="shrink-0 rounded-xl bg-white p-3">
          <QRCode value={url} size={152} aria-label="QR-код адреса табло" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <Field label="Адрес табло">
            <Input readOnly value={url} onFocus={(event) => event.target.select()} className="font-mono text-footnote" />
          </Field>
          <Button
            variant="secondary"
            size="sm"
            icon={copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => {
              void navigator.clipboard.writeText(url).then(() => {
                setCopied(true);
              });
            }}
          >
            {copied ? 'Скопировано' : 'Скопировать'}
          </Button>
          <p className="text-footnote text-muted">
            На телевизоре откройте адрес в браузере и включите полноэкранный режим. Табло само
            обновляется, держит экран включённым и раз в 6 часов перезагружается.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Ссылки для телевизоров в цеху.
 *
 * Ссылка — пропуск без входа: кто её знает, видит табло (без адресов и
 * клиентов). Поэтому создаёт и отзывает её только директор, адрес
 * показывается один раз, а в списке видно, когда каждый экран последний раз
 * выходил на связь, — забытую ссылку на чужом устройстве легко заметить.
 */
export function DisplayLinksManager(): ReactElement {
  const utils = trpc.useUtils();
  const list = trpc.displayLinks.list.useQuery();
  const branches = trpc.branches.list.useQuery();

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [branchId, setBranchId] = useState('');
  const [showWorkshop, setShowWorkshop] = useState(true);
  const [showInstallation, setShowInstallation] = useState(true);
  const [locale, setLocale] = useState<Locale>('ru');
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<DisplayLink | null>(null);

  const create = trpc.displayLinks.create.useMutation({
    async onSuccess(result) {
      setCreatedUrl(`${window.location.origin}/tv/${result.token}`);
      await utils.displayLinks.list.invalidate();
    },
  });
  const revoke = trpc.displayLinks.revoke.useMutation({
    async onSuccess() {
      setRevoking(null);
      await utils.displayLinks.list.invalidate();
    },
  });

  const openCreate = (): void => {
    setLabel('');
    setBranchId('');
    setShowWorkshop(true);
    setShowInstallation(true);
    setLocale('ru');
    setCreatedUrl(null);
    create.reset();
    setOpen(true);
  };
  const close = (): void => {
    setOpen(false);
    setCreatedUrl(null);
  };

  const errors = fieldErrors(create.error);
  const noBoard = !showWorkshop && !showInstallation;
  const now = Date.now();

  return (
    <Card>
      <CardHeader
        title="Табло на ТВ"
        level={3}
        action={
          <Button onClick={openCreate} icon={<Plus className="h-3.5 w-3.5" aria-hidden />}>
            Создать ссылку
          </Button>
        }
      />

      <CardBody>
        <p className="mb-3 max-w-3xl text-footnote text-muted">
          Секретная ссылка открывает табло на телевизоре без входа в систему. Адресов и имён клиентов на нём
          нет. Ссылку, которая попала не туда, отзовите — экран сразу покажет «Ссылка недействительна».
        </p>

        {list.isLoading ? (
          <Skeleton className="h-24" />
        ) : list.data === undefined || list.data.length === 0 ? (
          <EmptyState message="Ссылок ещё нет" hint="Создайте ссылку и откройте её на телевизоре в цеху" />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {list.data.map((link) => {
              const revoked = link.revokedAt !== null;
              return (
                <li
                  key={link.id}
                  className={cn(
                    'flex h-full flex-col rounded-tile border p-4',
                    revoked ? 'border-subtle/60 bg-base/20' : 'border-subtle bg-ink/[0.04]',
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      aria-hidden
                      className={cn(
                        'grid h-9 w-9 shrink-0 place-items-center rounded-tile',
                        revoked ? 'bg-raised text-muted' : 'bg-accent-soft text-accent',
                      )}
                    >
                      <Tv className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-subhead font-semibold', revoked ? 'text-muted' : 'text-primary')}>
                        {link.label}
                      </p>
                      <p className="mt-0.5 truncate text-footnote text-muted">
                        {revoked && link.revokedAt !== null
                          ? `отозвана ${formatDateTime(link.revokedAt, false)}`
                          : seenText(link.lastSeenAt, now)}
                      </p>
                    </div>
                    <Badge tone={revoked ? 'neutral' : 'positive'}>{revoked ? 'Отозвана' : 'Действует'}</Badge>
                  </div>

                  <dl className="mt-3.5 grid grid-cols-3 gap-3 border-t border-subtle pt-3">
                    <div className="min-w-0">
                      <dt className="text-overline uppercase text-muted">Табло</dt>
                      <dd className="mt-0.5 text-caption text-secondary">{boardsText(link)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-overline uppercase text-muted">Филиал</dt>
                      <dd className="mt-0.5 truncate text-caption text-secondary">{link.branchName ?? 'Все филиалы'}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-overline uppercase text-muted">Язык</dt>
                      <dd className="mt-0.5 text-caption text-secondary">{LOCALE_INFO[localeOf(link.locale)].label}</dd>
                    </div>
                  </dl>

                  {!revoked && (
                    <div className="mt-auto flex justify-end pt-3.5">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          revoke.reset();
                          setRevoking(link);
                        }}
                      >
                        Отозвать
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>

      <Modal
        open={open}
        title={createdUrl === null ? 'Новая ссылка для ТВ' : 'Ссылка создана'}
        onClose={close}
        footer={
          createdUrl === null ? (
            <>
              <Button variant="ghost" onClick={close}>
                Отмена
              </Button>
              <Button
                loading={create.isPending}
                disabled={noBoard}
                onClick={() => {
                  create.mutate({
                    label: label.trim(),
                    branchId: branchId === '' ? null : Number(branchId),
                    showWorkshop,
                    showInstallation,
                    locale,
                  });
                }}
              >
                Создать
              </Button>
            </>
          ) : (
            <Button onClick={close}>Готово</Button>
          )
        }
      >
        {createdUrl !== null ? (
          <CreatedLink url={createdUrl} />
        ) : (
          <div className="space-y-4">
            <Field label="Название" hint="Чтобы отличать экраны в списке" error={errors['label']} required>
              <Input
                value={label}
                maxLength={60}
                placeholder="ТВ в цеху"
                onChange={(event) => {
                  setLabel(event.target.value);
                }}
              />
            </Field>
            <Field label="Филиал" hint="Табло покажет только людей этого филиала">
              <Select
                value={branchId}
                onChange={(event) => {
                  setBranchId(event.target.value);
                }}
                placeholder="Все филиалы"
                options={(branches.data ?? []).map((branch) => ({ value: branch.id.toString(), label: branch.name }))}
              />
            </Field>
            {/*
              Группа флажков — `fieldset`, а не `Field`: тот оборачивает содержимое в `<label>`,
              и первый флажок получил бы подписью весь текст поля.
            */}
            <fieldset>
              <legend className="mb-1 block text-footnote text-secondary">Табло</legend>
              <div className="flex flex-wrap gap-4">
                {[
                  { group: MonitorGroup.WORKSHOP, checked: showWorkshop, set: setShowWorkshop },
                  { group: MonitorGroup.INSTALLATION, checked: showInstallation, set: setShowInstallation },
                ].map((option) => (
                  <label key={option.group} className="flex items-center gap-2 text-caption text-primary">
                    <input
                      type="checkbox"
                      checked={option.checked}
                      onChange={(event) => {
                        option.set(event.target.checked);
                      }}
                      className="h-4 w-4 accent-[rgb(var(--accent))]"
                    />
                    {MONITOR_GROUP_LABELS.ru[option.group]}
                  </label>
                ))}
              </div>
              <p className={cn('mt-1 text-overline', noBoard ? 'text-danger' : 'text-muted')}>
                {noBoard ? 'Выберите хотя бы одно табло' : 'Если выбрать оба, они сменяют друг друга каждые 30 секунд'}
              </p>
            </fieldset>
            <Field label="Язык подписей на экране">
              <Select
                value={locale}
                onChange={(event) => {
                  setLocale(localeOf(event.target.value));
                }}
                options={LOCALES.map((value) => ({ value, label: LOCALE_INFO[value].label }))}
              />
            </Field>
            <FormError message={create.error !== null && Object.keys(errors).length === 0 ? create.error.message : null} />
          </div>
        )}
      </Modal>

      <Modal
        open={revoking !== null}
        title="Отозвать ссылку?"
        onClose={() => {
          setRevoking(null);
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setRevoking(null);
              }}
            >
              Не отзывать
            </Button>
            <Button
              variant="danger"
              loading={revoke.isPending}
              onClick={() => {
                if (revoking !== null) revoke.mutate({ id: revoking.id });
              }}
            >
              Отозвать
            </Button>
          </>
        }
      >
        <p className="text-caption text-secondary">
          {`Экран «${revoking?.label ?? ''}» при следующем обновлении покажет «Ссылка недействительна». Вернуть ссылку нельзя — для этого экрана придётся создать новую.`}
        </p>
        <FormError message={revoke.error?.message ?? null} />
      </Modal>
    </Card>
  );
}
