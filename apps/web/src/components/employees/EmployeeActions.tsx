'use client';

import {
  Role,
  ROLE_LABELS_RU,
  ROLES,
} from '@curtain-crm/shared';
import { Camera, ClipboardList, KeyRound, Pencil, ShieldCheck, UserMinus, UserPlus } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';

import { useAuth } from '@/components/providers/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import {
  Button,
  Field,
  FormError,
  Input,
  Modal,
} from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

import { TaskCreateDialog } from './TaskCreateDialog';
import { cn } from '@/lib/utils';

/**
 * Сколько мегабайт принимаем у снимка.
 *
 * Тот же предел, что у фотофиксации заказа и у сервера
 * (`MAX_UPLOAD_SIZE_MB`): снимок с телефона в него укладывается,
 * а не сжатый кадр с зеркалки — нет, и это честнее сказать до загрузки.
 */
const MAX_PHOTO_MB = 15;

/**
 * Действия над сотрудником: фото, роли, приём и увольнение, сброс пароля.
 *
 * Роли, пароль и увольнение — `ceoProcedure`, ими управляет только директор.
 * Фото — руководство целиком: портреты штата загружает тот, кто ведёт
 * кадровые дела, и упираться в директора ради фотографии незачем. Кнопки
 * скрываются от остальных, но решает, как всегда, сервер.
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
    /** Текущее фото — показать в окне и решить, есть ли что убирать. */
    readonly avatarUrl: string | null;
  };
  readonly onEdit: () => void;
}): ReactElement {
  const { hasRole, isManagement, user } = useAuth();
  const isCeo = hasRole(Role.CEO);

  const [rolesOpen, setRolesOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [taskOpen, setTaskOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  /** Ссылка есть, а файл не открылся: удалён или истекла подпись. */
  const [photoBroken, setPhotoBroken] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const refresh = async (): Promise<void> => {
    await Promise.all([utils.users.list.invalidate(), utils.users.stats.invalidate()]);
  };

  const setAvatar = trpc.users.setAvatar.useMutation({
    async onSuccess() {
      setPhotoOpen(false);
      await refresh();
    },
  });
  const removeAvatar = trpc.users.removeAvatar.useMutation({
    async onSuccess() {
      setPhotoOpen(false);
      await refresh();
    },
  });

  /*
    Файл читается в base64 прямо здесь, как в фотофиксации заказа: tRPC
    возит JSON, multipart ему не с чем принять. Проверка размера — до
    чтения: на предел упирается сервер, но узнать об этом после загрузки
    десяти мегабайт по мобильному интернету обидно.
  */
  const handleFile = (file: File): void => {
    if (!file.type.startsWith('image/')) {
      setPhotoError('Нужен файл с фотографией');
      return;
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      setPhotoError(`Файл больше ${MAX_PHOTO_MB.toString()} МБ — уменьшите снимок`);
      return;
    }

    setPhotoError(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setPhotoError('Не удалось прочитать файл');
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        setPhotoError('Не удалось прочитать файл');
        return;
      }
      setAvatar.mutate({
        userId: employee.id,
        // Префикс `data:image/jpeg;base64,` серверу не нужен: он ждёт
        // само содержимое, а тип берёт из `mimeType`.
        file: { fileName: file.name, mimeType: file.type, content: result.slice(result.indexOf(',') + 1) },
      });
    };
    reader.readAsDataURL(file);
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

      <TaskCreateDialog
        open={taskOpen}
        employee={employee}
        onClose={() => {
          setTaskOpen(false);
        }}
      />

      {isManagement && (
        <IconButton
          label="Фото"
          onClick={() => {
            setPhotoError(null);
            setPhotoBroken(false);
            setPhotoOpen(true);
          }}
        >
          <Camera className="h-3.5 w-3.5" />
        </IconButton>
      )}

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

      {/* --- Фото ---------------------------------------------------------
        Отдельным окном, а не загрузкой по клику на аватар в строке: снимок
        меняют редко, а промахнуться мышью по строке легко, и подменять лицо
        сотрудника одним случайным кликом нельзя.
      */}
      <Modal
        open={photoOpen}
        title={`Фото: ${employee.fullName}`}
        onClose={() => {
          setPhotoOpen(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setPhotoOpen(false);
              }}
            >
              Закрыть
            </Button>
            <Button
              loading={setAvatar.isPending}
              disabled={removeAvatar.isPending}
              onClick={() => {
                fileInput.current?.click();
              }}
            >
              {employee.avatarUrl === null ? 'Загрузить фото' : 'Заменить фото'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError
            message={photoError ?? setAvatar.error?.message ?? removeAvatar.error?.message ?? null}
          />

          <div className="flex items-center gap-4">
            {employee.avatarUrl === null || photoBroken ? (
              // Тот же запасной вариант, что в списке: битая картинка
              // браузера выглядит как поломка системы, инициалы — нет.
              <Avatar url={null} fullName={employee.fullName} />
            ) : (
              <img
                src={employee.avatarUrl}
                alt=""
                onError={() => {
                  setPhotoBroken(true);
                }}
                className="h-28 w-20 rounded-md border border-ink/10 object-cover object-top"
              />
            )}

            <div className="space-y-2 text-caption text-secondary">
              <p>
                Портрет в карточке — рабочий документ: снимает его мастерская, и сам сотрудник
                своё фото не меняет.
              </p>
              {employee.avatarUrl !== null && (
                <Button
                  variant="danger"
                  size="sm"
                  loading={removeAvatar.isPending}
                  disabled={setAvatar.isPending}
                  onClick={() => {
                    removeAvatar.mutate({ userId: employee.id });
                  }}
                >
                  Убрать фото
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/*
        Инпут скрыт и живёт вне окна: браузер открывает выбор файла только по
        клику пользователя, а окно к этому моменту уже может закрыться.
        Сброс `value` обязателен — иначе повторный выбор ТОГО ЖЕ файла не
        поднимет событие, и «заменить фото» будет молчать.
      */}
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file !== undefined) handleFile(file);
        }}
      />

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
                  className="flex items-center gap-3 rounded-2xl border border-ink/[0.06] bg-ink/[0.04] px-3 py-2"
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
            : 'text-muted hover:bg-ink/[0.08] hover:text-primary',
      )}
    >
      {children}
    </button>
  );
}
