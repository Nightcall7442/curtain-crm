'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactElement } from 'react';

import { tokenStorage, trpc } from '@/lib/trpc';

/**
 * Вход в систему — по референсу «Неон»: тёмный холст со свечением, слева
 * крупный заголовок капителью и три живых плитки-показателя, справа —
 * стеклянная форма с неоновой кнопкой.
 *
 * Логин — номер телефона в любом виде: сервер нормализует его к E.164,
 * поэтому «+998 90 123 45 67» и «901234567» — один и тот же сотрудник.
 *
 * Сообщение об ошибке одинаково для неверного пароля и несуществующего
 * номера: по разнице ответов иначе можно было бы перебрать список
 * сотрудников.
 *
 * Страница всегда тёмная, независимо от выбранной темы: это витрина, а не
 * рабочее место, и она одна на всех.
 */
export default function LoginPage(): ReactElement {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const queryClient = useQueryClient();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess(data) {
      tokenStorage.save({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      // Кэш запросов — от предыдущего пользователя: без сброса новый
      // вошедший видел бы чужой дашборд и чужие заказы до обновления страницы.
      queryClient.clear();
      // `replace`, а не `push`: возврат «назад» на экран входа после успешного
      // входа только путает. Ведёт в `/dashboard`, а не в корень: там теперь
      // публичный лендинг, а не панель.
      router.replace('/dashboard');
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    loginMutation.mutate({ phone, password });
  };

  const fieldErrors = loginMutation.error?.data?.zodError ?? null;

  return (
    <main
      data-theme="dark"
      className="login-canvas relative grid min-h-screen overflow-hidden text-[rgb(234_245_238)] lg:grid-cols-[1.1fr_1fr]"
    >
      {/* --- Витрина --------------------------------------------------------- */}
      <section className="relative flex flex-col justify-between p-8 sm:p-12 lg:p-14">
        <div className="flex items-center gap-3">
          <span
            role="img"
            aria-label="Design House"
            className="block h-12 w-[76px] bg-current"
            style={{
              WebkitMaskImage: 'url(/logo.png)',
              maskImage: 'url(/logo.png)',
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'left center',
              maskPosition: 'left center',
            }}
          />
          <span className="flex flex-col leading-tight">
            <span className="text-caption font-semibold uppercase tracking-[0.24em]">Parda Bozor</span>
            <span className="text-overline tracking-[0.05em] text-[rgb(234_245_238_/_0.55)]">
              шторы премиум класса
            </span>
          </span>
        </div>

        <div className="my-10 flex max-w-[560px] flex-col gap-6 lg:my-0">
          <h1 className="font-hero text-[40px] font-extrabold uppercase leading-[0.98] tracking-[-0.02em] sm:text-[56px] xl:text-[64px]">
            Заказ проходит
            <br />
            восемь рук.
            <br />
            <span className="login-neon">Система помнит каждую.</span>
          </h1>
          <p className="max-w-[440px] text-body leading-relaxed text-[rgb(234_245_238_/_0.68)]">
            Замер, раскрой, пошив, контроль, установка — каждый переход записан: кто, когда и
            почему. Историю не переписать даже директору.
          </p>
        </div>

        <dl className="hidden gap-3 sm:grid sm:grid-cols-3 lg:max-w-[520px]">
          {FACTS.map((fact) => (
            <div key={fact.label} className="login-tile flex flex-col gap-1 rounded-2xl p-4">
              <dt className="text-footnote text-[rgb(234_245_238_/_0.6)]">{fact.label}</dt>
              <dd className="login-neon font-hero text-[28px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* --- Форма ----------------------------------------------------------- */}
      <section className="relative flex items-center justify-center px-6 pb-14 sm:px-12 lg:px-14">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="login-glass flex w-full max-w-[400px] flex-col gap-5 rounded-[26px] p-7 sm:p-8"
        >
          <div className="flex flex-col gap-1.5">
            <h2 className="font-hero text-title font-bold tracking-[-0.02em]">Вход для сотрудников</h2>
            <p className="text-caption text-[rgb(234_245_238_/_0.6)]">
              Рабочий номер телефона и пароль
            </p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-footnote font-medium text-[rgb(234_245_238_/_0.75)]">
              Номер телефона
            </span>
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
              className="login-field w-full rounded-xl px-4 py-3 font-mono text-body outline-none"
            />
            {fieldErrors?.['phone']?.[0] !== undefined && (
              <span className="text-footnote text-danger">{fieldErrors['phone'][0]}</span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-footnote font-medium text-[rgb(234_245_238_/_0.75)]">Пароль</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              placeholder="••••••••"
              className="login-field w-full rounded-xl px-4 py-3 font-mono text-body tracking-[0.14em] outline-none"
            />
          </label>

          {loginMutation.error !== null && fieldErrors === null && (
            <p
              role="alert"
              className="rounded-xl border border-danger/30 bg-danger/15 px-3.5 py-2.5 text-caption text-danger"
            >
              {loginMutation.error.message}
            </p>
          )}

          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="login-submit pressable mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-full text-body font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loginMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden />
            )}
            Войти
          </button>

          <p className="text-footnote leading-relaxed text-[rgb(234_245_238_/_0.5)]">
            Забыли пароль? Обратитесь к директору — сброс делает только он.
          </p>
        </form>
      </section>
    </main>
  );
}

const FACTS = [
  { value: '17', label: 'статусов заказа' },
  { value: '8', label: 'этапов производства' },
  { value: '0', label: 'переходов без следа' },
] as const;
