'use client';

import { KeyRound } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { BranchManager } from '@/components/settings/BranchManager';
import { CatalogManager } from '@/components/settings/CatalogManager';
import { PurchaseItemManager } from '@/components/settings/PurchaseItemManager';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button, Field, FormError, Input, Modal } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

/**
 * Настройки: филиалы, справочники, каталог закупки и собственный пароль.
 *
 * Разделы отсортированы по частоте использования: филиалы и радиус трогают
 * редко, но именно от них зависит, сможет ли цех отмечать смены, поэтому
 * они сверху.
 */
export default function SettingsPage(): ReactElement {
  return (
    <div className="space-y-3">
      <BranchManager />
      <CatalogManager />
      <PurchaseItemManager />
      <PasswordCard />
    </div>
  );
}

/**
 * Смена собственного пароля.
 *
 * После смены сервер завершает ВСЕ сессии, включая текущую: если пароль
 * меняют из-за подозрения на компрометацию, оставлять чужие refresh-токены
 * живыми нельзя. Поэтому предупреждаем о повторном входе заранее.
 */
function PasswordCard(): ReactElement {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');

  const change = trpc.auth.changePassword.useMutation({
    onSuccess() {
      setOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setRepeat('');
    },
  });

  /**
   * Завершение всех сессий без смены пароля.
   *
   * Нужно, когда телефон потерян: пароль менять незачем, а вот отозвать
   * refresh-токены с чужого устройства — обязательно.
   */
  const logoutAll = trpc.auth.logoutAll.useMutation();

  const mismatch = repeat.length > 0 && repeat !== newPassword;

  return (
    <Card>
      <CardHeader title="Безопасность" icon={<KeyRound className="h-4 w-4" />} />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-[12.5px] text-secondary">
            Смена пароля завершит все ваши сессии — на телефоне и в браузере
            придётся войти заново.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(true);
            }}
          >
            Сменить пароль
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-subtle pt-3">
          <p className="min-w-0 flex-1 text-[12.5px] text-secondary">
            {logoutAll.isSuccess
              ? 'Все сессии завершены. На других устройствах потребуется войти заново.'
              : 'Потеряли телефон? Отзовите доступ со всех устройств, не меняя пароль.'}
          </p>
          <Button
            variant="danger"
            loading={logoutAll.isPending}
            onClick={() => {
              logoutAll.mutate();
            }}
          >
            Выйти со всех устройств
          </Button>
        </div>

        <FormError message={logoutAll.error?.message ?? null} />
      </CardBody>

      <Modal
        open={open}
        title="Смена пароля"
        onClose={() => {
          setOpen(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
              }}
            >
              Отмена
            </Button>
            <Button
              loading={change.isPending}
              disabled={newPassword.length < 8 || mismatch || currentPassword.length === 0}
              onClick={() => {
                change.mutate({ currentPassword, newPassword });
              }}
            >
              Сменить
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError message={change.error?.message ?? null} />

          <Field label="Текущий пароль" required>
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
              }}
            />
          </Field>

          <Field label="Новый пароль" required hint="Минимум 8 символов">
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
              }}
            />
          </Field>

          <Field
            label="Повторите новый пароль"
            required
            error={mismatch ? 'Пароли не совпадают' : undefined}
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(event) => {
                setRepeat(event.target.value);
              }}
              invalid={mismatch}
            />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}
