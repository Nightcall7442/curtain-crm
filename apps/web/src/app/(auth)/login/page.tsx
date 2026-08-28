'use client';

import { Loader2, Lock, Phone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';

import { tokenStorage, trpc } from '@/lib/trpc';

/**
 * Вход в систему.
 *
 * Логин — номер телефона в любом виде: сервер нормализует его к E.164,
 * поэтому `+998 90 123 45 67` и `901234567` — одна и та же учётная запись.
 *
 * Сообщение об ошибке берётся с сервера как есть: оно на русском и намеренно
 * одинаково для несуществующего номера и неверного пароля, чтобы по ответу
 * нельзя было перебрать список сотрудников.
 */
export default function LoginPage(): ReactElement {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess(data) {
      tokenStorage.save({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      // `replace`, а не `push`: возврат «назад» на экран входа после успешного
      // входа только путает.
      router.replace('/');
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    loginMutation.mutate({ phone, password });
  };

  const fieldErrors = loginMutation.error?.data?.zodError ?? null;

  return (
    <main className="grid min-h-screen place-items-center bg-base px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <span
            aria-hidden
            className="grid h-14 w-14 place-items-center rounded-lg border border-gold-dim text-lg font-bold text-gold"
          >
            DH
          </span>
          <div className="text-center">
            <p className="text-[15px] font-semibold tracking-[0.2em] text-gold-soft">
              DESIGN HOUSE
            </p>
            <p className="mt-0.5 text-[11px] tracking-wide text-muted">шторы премиум класса</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-panel border border-subtle bg-panel p-6 shadow-panel"
          noValidate
        >
          <h1 className="text-[14px] font-semibold text-primary">Вход в систему</h1>
          <p className="mt-1 text-[12px] text-muted">
            Введите рабочий номер телефона и пароль
          </p>

          <label className="mt-5 block">
            <span className="mb-1.5 block text-[11.5px] text-secondary">Номер телефона</span>
            <span className="relative block">
              <Phone
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                type="tel"
                inputMode="tel"
                autoComplete="username"
                required
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                }}
                placeholder="+998 90 123 45 67"
                className="w-full rounded-md border border-subtle bg-base py-2.5 pl-9 pr-3 text-[13px] text-primary placeholder:text-muted/70 focus:border-gold-dim focus:outline-none"
              />
            </span>
            {fieldErrors?.['phone']?.[0] !== undefined && (
              <span className="mt-1 block text-[11.5px] text-danger">
                {fieldErrors['phone'][0]}
              </span>
            )}
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[11.5px] text-secondary">Пароль</span>
            <span className="relative block">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                placeholder="••••••••"
                className="w-full rounded-md border border-subtle bg-base py-2.5 pl-9 pr-3 text-[13px] text-primary placeholder:text-muted/70 focus:border-gold-dim focus:outline-none"
              />
            </span>
          </label>

          {loginMutation.error !== null && fieldErrors === null && (
            <p role="alert" className="mt-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              {loginMutation.error.message}
            </p>
          )}

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-gold py-2.5 text-[13px] font-semibold text-base transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loginMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Войти
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-muted">
          Забыли пароль? Обратитесь к директору — сброс делает только он.
        </p>
      </div>
    </main>
  );
}
