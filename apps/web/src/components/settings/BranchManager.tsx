'use client';

import {
  DEFAULT_CHECK_IN_RADIUS_METERS,
  MAX_CHECK_IN_RADIUS_METERS,
  MIN_CHECK_IN_RADIUS_METERS,
} from '@curtain-crm/shared';
import { MapPin, Pencil, Plus, Power } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui/Card';
import { Button, Field, fieldErrors, FormError, Input, Modal } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

/**
 * Филиалы и радиус отметки смены.
 *
 * Радиус хранится у филиала, а не в коде: изменить его можно без выкладки
 * новой версии, и у каждого цеха он может быть свой — большой цех на окраине
 * требует большего допуска, чем офис в центре.
 *
 * Филиалы не удаляются: за ними числятся смены и заказы. Вывод из обращения —
 * это `is_active = false`.
 */
export function BranchManager(): ReactElement {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState(DEFAULT_CHECK_IN_RADIUS_METERS.toString());

  const utils = trpc.useUtils();
  const list = trpc.branches.list.useQuery({ includeInactive: true });

  const refresh = async (): Promise<void> => {
    await utils.branches.list.invalidate();
  };

  const close = (): void => {
    setOpen(false);
    setEditingId(null);
    create.reset();
    update.reset();
  };

  const create = trpc.branches.create.useMutation({
    async onSuccess() {
      await refresh();
      close();
    },
  });

  const update = trpc.branches.update.useMutation({
    async onSuccess() {
      await refresh();
      close();
    },
  });

  const setActive = trpc.branches.setActive.useMutation({ onSuccess: refresh });

  const errors = fieldErrors(editingId === null ? create.error : update.error);

  const openCreate = (): void => {
    setEditingId(null);
    setName('');
    setAddress('');
    setLatitude('');
    setLongitude('');
    setRadius(DEFAULT_CHECK_IN_RADIUS_METERS.toString());
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader
        title="Филиалы и радиус отметки"
        icon={<MapPin className="h-4 w-4" />}
        action={
          <Button onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Новый филиал
          </Button>
        }
      />

      <CardBody>
        <p className="mb-3 text-[11.5px] text-muted">
          {`Радиус задаётся для каждого филиала отдельно, от ${MIN_CHECK_IN_RADIUS_METERS.toString()} до ${MAX_CHECK_IN_RADIUS_METERS.toString()} м. ` +
            'Сотрудник вне радиуса не откроет смену — приложение покажет, на сколько метров он промахнулся.'}
        </p>

        {list.isLoading ? (
          <Skeleton className="h-24" />
        ) : list.data === undefined || list.data.length === 0 ? (
          <EmptyState message="Филиалы не заведены" />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {list.data.map((branch) => (
              <li key={branch.id} className="rounded border border-subtle bg-base/40 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-primary">{branch.name}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {`${branch.latitude.toFixed(5)}, ${branch.longitude.toFixed(5)} · радиус ${branch.radiusMeters.toString()} м`}
                    </p>
                    {branch.address !== null && (
                      <p className="mt-0.5 truncate text-[11.5px] text-secondary">
                        {branch.address}
                      </p>
                    )}
                  </div>

                  <Badge tone={branch.isActive ? 'positive' : 'neutral'}>
                    {branch.isActive ? 'Активен' : 'Отключён'}
                  </Badge>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingId(branch.id);
                      setName(branch.name);
                      setAddress(branch.address ?? '');
                      setLatitude(branch.latitude.toString());
                      setLongitude(branch.longitude.toString());
                      setRadius(branch.radiusMeters.toString());
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Изменить
                  </Button>

                  <Button
                    variant={branch.isActive ? 'danger' : 'secondary'}
                    disabled={setActive.isPending}
                    onClick={() => {
                      setActive.mutate({ id: branch.id, isActive: !branch.isActive });
                    }}
                  >
                    <Power className="h-3.5 w-3.5" aria-hidden />
                    {branch.isActive ? 'Отключить' : 'Включить'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {setActive.error !== null && (
          <div className="mt-3">
            <FormError message={setActive.error.message} />
          </div>
        )}
      </CardBody>

      <Modal
        open={open}
        title={editingId === null ? 'Новый филиал' : 'Правка филиала'}
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
                const payload = {
                  name: name.trim(),
                  address: address.trim().length > 0 ? address.trim() : null,
                  latitude: Number.parseFloat(latitude.replace(',', '.')),
                  longitude: Number.parseFloat(longitude.replace(',', '.')),
                  radiusMeters: Number.parseInt(radius, 10) || DEFAULT_CHECK_IN_RADIUS_METERS,
                };

                if (editingId === null) create.mutate(payload);
                else update.mutate({ id: editingId, ...payload });
              }}
            >
              Сохранить
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError
            message={
              Object.keys(errors).length === 0
                ? ((editingId === null ? create.error?.message : update.error?.message) ?? null)
                : null
            }
          />

          <Field label="Название" required error={errors['name']}>
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              placeholder="Цех №2"
              invalid={errors['name'] !== undefined}
            />
          </Field>

          <Field label="Адрес" error={errors['address']}>
            <Input
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
              }}
              placeholder="г. Ташкент, ул. …"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Широта"
              required
              error={errors['latitude']}
              hint="Из карты: 41.29950"
            >
              <Input
                inputMode="decimal"
                value={latitude}
                onChange={(event) => {
                  setLatitude(event.target.value);
                }}
                placeholder="41.2995"
                invalid={errors['latitude'] !== undefined}
              />
            </Field>

            <Field label="Долгота" required error={errors['longitude']}>
              <Input
                inputMode="decimal"
                value={longitude}
                onChange={(event) => {
                  setLongitude(event.target.value);
                }}
                placeholder="69.2401"
                invalid={errors['longitude'] !== undefined}
              />
            </Field>

            <Field label="Радиус, м" error={errors['radiusMeters']}>
              <Input
                type="number"
                min={MIN_CHECK_IN_RADIUS_METERS}
                max={MAX_CHECK_IN_RADIUS_METERS}
                value={radius}
                onChange={(event) => {
                  setRadius(event.target.value);
                }}
                invalid={errors['radiusMeters'] !== undefined}
              />
            </Field>
          </div>

          <p className="text-[11.5px] text-muted">
            Координаты можно взять из карт: правый клик по точке цеха → координаты.
            Порядок именно такой — сначала широта, потом долгота.
          </p>
        </div>
      </Modal>
    </Card>
  );
}
