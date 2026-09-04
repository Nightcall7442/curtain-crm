'use client';

import {
  Role,
  ROLE_LABELS_RU,
  ROLES,
} from '@curtain-crm/shared';
import { ClipboardList, KeyRound, Pencil, ShieldCheck, UserMinus, UserPlus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Badge } from '@/components/ui/Badge';
import {
  Button,
  controlClass,
  Field,
  FormError,
  Input,
  Modal,
} from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

/**
 * Действия над сотрудником: роли, приём и увольнение, сброс пароля.
 *
 * Все три процедуры объявлены как `ceoProcedure` — ролями управляет только
 * директор. Кнопки скрываются от остальных, но решает, как всегда, сервер.
 *
 * Система защищена от самоблокировки: снять последнюю роль, уволить
 * последнего директора или деактивировать себя нельзя — сервер вернёт
 * понятную ошибку, и она показывается здесь как есть.
 */
export function EmployeeActions({
  employee,
  onEdit,
}: {
  readonly employee: {
    readonly id: number;
    readonly fullName: string;
    readonly isActive: boolean;
    readonly roles: readonly Role[];
  };
  readonly onEdit: () => void;
}): ReactElement {
  const { hasRole, user } = useAuth();
  const toast = useToast();
  const isCeo = hasRole(Role.CEO);

  const [rolesOpen, setRolesOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDetails, setTaskDetails] = useState('');
  const [taskDue, setTaskDue] = useState('');

  const utils = trpc.useUtils();
  const refresh = async (): Promise<void> => {
    await Promise.all([utils.users.list.invalidate(), utils.users.stats.invalidate()]);
  };

  const grant = trpc.users.grantRole.useMutation({ onSuccess: refresh });
  const revoke = trpc.users.revokeRole.useMutation({ onSuccess: refresh });
  const setActive = trpc.users.setActive.useMutation({ onSuccess: refresh });
  const resetPassword = trpc.users.resetPassword.useMutation({
    onSuccess() {
      setPasswordOpen(false);
      setNewPassword('');
    },
  });

  const createTask = trpc.tasks.create.useMutation({
    onSuccess() {
      setTaskOpen(false);
      setTaskTitle('');
      setTaskDetails('');
      setTaskDue('');
      toast.success('Доп. работа отправлена', `${employee.fullName} получит уведомление`);
      void utils.tasks.list.invalidate();
    },
    onError(error) {
      toast.error('Доп. работа не создана', error.message);
    },
  });

  const isSelf = user?.id === employee.id;

  return (
    <div className="flex items-center justify-end gap-1">
      <IconButton label="Изменить данные" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
      </IconButton>

      {employee.isActive && (
        <IconButton
          label="Дать поручение"
          onClick={() => {
            setTaskOpen(true);
          }}
        >
          <ClipboardList className="h-3.5 w-3.5" />
        </IconButton>
      )}

      <Modal
        open={taskOpen}
        title={`Доп. работа: ${employee.fullName}`}
        onClose={() => {
          setTaskOpen(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setTaskOpen(false);
              }}
            >
              Отмена
            </Button>
            <Button
              loading={createTask.isPending}
              disabled={taskTitle.trim().length === 0}
              onClick={() => {
                createTask.mutate({
                  assigneeId: employee.id,
                  title: taskTitle.trim(),
                  ...(taskDetails.trim().length > 0 ? { details: taskDetails.trim() } : {}),
                  ...(taskDue.length > 0 ? { dueDate: taskDue } : {}),
                });
              }}
            >
              Отправить
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={createTask.error?.message ?? null} />

          <Field label="Что нужно сделать" required>
            <Input
              value={taskTitle}
              onChange={(event) => {
                setTaskTitle(event.target.value);
              }}
              placeholder="Например: получить ткань у поставщика"
            />
          </Field>

          <Field label="Подробности">
            <textarea
              value={taskDetails}
              onChange={(event) => {
                setTaskDetails(event.target.value);
              }}
              rows={3}
              placeholder="Адрес, контакты, детали — всё, что понадобится на месте"
              className={controlClass('md')}
            />
          </Field>

          <Field label="Срок" hint="Не обязателен — поручение без срока просто висит открытым">
            <Input
              type="date"
              value={taskDue}
              onChange={(event) => {
                setTaskDue(event.target.value);
              }}
            />
          </Field>
        </div>
      </Modal>

      {isCeo && (
        <>
          <IconButton
            label="Роли"
            onClick={() => {
              setRolesOpen(true);
            }}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
          </IconButton>

          <IconButton
            label="Сбросить пароль"
            onClick={() => {
              setPasswordOpen(true);
            }}
          >
            <KeyRound className="h-3.5 w-3.5" />
          </IconButton>

          <IconButton
            label={employee.isActive ? 'Уволить' : 'Восстановить'}
            disabled={setActive.isPending || (isSelf && employee.isActive)}
            tone={employee.isActive ? 'danger' : 'positive'}
            onClick={() => {
              setActive.mutate({ id: employee.id, isActive: !employee.isActive });
            }}
          >
            {employee.isActive ? (
              <UserMinus className="h-3.5 w-3.5" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
          </IconButton>
        </>
      )}

      {setActive.error !== null && (
        <span className="max-w-[240px] truncate text-overline text-danger" title={setActive.error.message}>
          {setActive.error.message}
        </span>
      )}

      {/* --- Роли --------------------------------------------------------- */}
      <Modal
        open={rolesOpen}
        title={`Роли: ${employee.fullName}`}
        onClose={() => {
          setRolesOpen(false);
        }}
        footer={
          <Button
            variant="secondary"
            onClick={() => {
              setRolesOpen(false);
            }}
          >
            Закрыть
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-footnote text-secondary">
            Роли складываются: сотрудник с ролями «мастер» и «швея» получает
            права обеих. Изменения применяются сразу и попадают в журнал.
          </p>

          <FormError message={grant.error?.message ?? revoke.error?.message ?? null} />

          <ul className="space-y-1.5">
            {ROLES.map((role) => {
              const active = employee.roles.includes(role);
              const busy = grant.isPending || revoke.isPending;

              return (
                <li
                  key={role}
                  className="flex items-center gap-3 rounded border border-subtle bg-base/40 px-3 py-2"
                >
                  <span className="flex-1 text-caption text-primary">
                    {ROLE_LABELS_RU[role]}
                  </span>

                  {active && <Badge tone="positive">выдана</Badge>}

                  <Button
                    variant={active ? 'danger' : 'secondary'}
                    disabled={busy}
                    onClick={() => {
                      if (active) revoke.mutate({ id: employee.id, role });
                      else grant.mutate({ id: employee.id, role });
                    }}
                  >
                    {active ? 'Отозвать' : 'Выдать'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>

      {/* --- Сброс пароля -------------------------------------------------- */}
      <Modal
        open={passwordOpen}
        title={`Сброс пароля: ${employee.fullName}`}
        onClose={() => {
          setPasswordOpen(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setPasswordOpen(false);
              }}
            >
              Отмена
            </Button>
            <Button
              loading={resetPassword.isPending}
              disabled={newPassword.length < 8}
              onClick={() => {
                resetPassword.mutate({ id: employee.id, newPassword });
              }}
            >
              Сбросить
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormError message={resetPassword.error?.message ?? null} />

          <p className="text-footnote text-secondary">
            Текущий пароль знать не нужно. Все сессии сотрудника будут
            завершены — на телефоне ему придётся войти заново.
          </p>

          <Field label="Новый пароль" required hint="Минимум 8 символов">
            <Input
              type="text"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
              }}
              placeholder="Передайте сотруднику лично"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled = false,
  tone = 'neutral',
}: {
  readonly children: ReactElement;
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly tone?: 'neutral' | 'danger' | 'positive';
}): ReactElement {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid h-7 w-7 place-items-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-30',
        tone === 'danger'
          ? 'text-muted hover:bg-danger/10 hover:text-danger'
          : tone === 'positive'
            ? 'text-muted hover:bg-positive/10 hover:text-positive'
            : 'text-muted hover:bg-raised hover:text-primary',
      )}
    >
      {children}
    </button>
  );
}
