'use client';

import { KeyRound } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';

import { BranchManager } from '@/components/settings/BranchManager';
import { CatalogManager } from '@/components/settings/CatalogManager';
import { PurchaseItemManager } from '@/components/settings/PurchaseItemManager';
import { LocalePicker } from '@/components/settings/LocalePicker';
import { SkinPicker } from '@/components/settings/SkinPicker';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button, Field, FormError, Input, Modal } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

/**
 * Настройки: филиалы, справочники, каталог закупки и собственный пароль.
 *
 * Карточки собраны в три озаглавленных раздела, а не идут сплошной стопкой.
 * Стопка из пяти одинаковых карточек не отвечала на главный вопрос человека,
 * впервые сюда зашедшего: что здесь общее для всей мастерской, а что —
 * только моё. Разница существенная: радиус отметки правит смены всему цеху,
 * а выбранный скин не виден никому, кроме автора.
 *
 * Порядок разделов — по цене ошибки. Сверху то, что действует на всех, снизу
 * личное; внутри «Организации» — филиалы, от которых зависит, сможет ли цех
 * вообще отметить смену.
 */
export default function SettingsPage(): ReactElement {
  return (
    <div className="space-y-6">
      <SettingsSection
        title="Организация"
        hint="Параметры мастерской. Действуют на всех сотрудников сразу."
      >
        <BranchManager />
      </SettingsSection>

      <SettingsSection
        title="Справочники"
        hint="То, из чего продавец собирает заказ. Позиции отсюда не удаляются, а выводятся из обращения — удалённая позиция обнулила бы аналитику по старым заказам."
      >
        <CatalogManager />
        <PurchaseItemManager />
      </SettingsSection>

      <SettingsSection
        title="Личные настройки"
        hint="Касаются только вашей учётной записи. Другие сотрудники этих изменений не увидят."
      >
        <LocalePicker />
        <ThemePicker />
        <SkinPicker />
        <PasswordCard />
      </SettingsSection>
    </div>
  );
}

/**
 * Заголовок раздела настроек.
 *
 * Живёт в этом файле, а не в общих примитивах: пока это единственная страница,
 * где карточки нуждаются в группировке. Переносить в `components/ui` стоит со
 * вторым местом применения, а не в ожидании его.
 */
function SettingsSection({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className="space-y-3">
      <header className="px-0.5">
        <h2 className="text-heading font-semibold tracking-tight text-primary">{title}</h2>
        {/*
          Ограничение ширины — не украшение: строка на всю ширину монитора
          в 1900 пикселей теряет начало следующей строки при переводе взгляда.
        */}
        <p className="mt-1 max-w-3xl text-caption leading-relaxed text-muted">{hint}</p>
      </header>

      <div className="space-y-4">{children}</div>
    </section>
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
      <CardHeader title="Безопасность" icon={<KeyRound className="h-4 w-4" />} level={3} />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-caption text-secondary">
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
          <p className="min-w-0 flex-1 text-caption text-secondary">
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
        <div className="space-y-4">
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
