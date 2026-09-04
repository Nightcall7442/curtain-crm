'use client';

import { Loader2 } from 'lucide-react';
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
 *
 * Экран двухчастный: слева — единственное тёмное место во всей панели, справа
 * форма на светлом. Это не украшение, а разделение ролей: до входа человек
 * смотрит на бренд, после входа — только на данные, и панель больше нигде
 * не позволяет себе крупных пятен.
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
    <main className="grid min-h-screen bg-base lg:grid-cols-[1.15fr_1fr]">
      {/* --- Фирменная половина ------------------------------------------- */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-primary p-14 text-base lg:flex">
        {/* Драпировка: вертикальные складки ткани. Чисто декоративный слой. */}
        <div aria-hidden className="absolute inset-0 flex opacity-50">
          {DRAPE_TINTS.map((tint, index) => (
            <div
              key={index}
              className="flex-1"
              style={{
                background: `linear-gradient(90deg, rgb(255 255 255 / 0) 0%, ${tint} 48%, rgb(0 0 0 / 0.22) 100%)`,
              }}
            />
          ))}
        </div>

        {/*
          Настоящий знак вместо монограммы «PB», которая стояла заглушкой.

          Знак не картинка, а маска, залитая цветом текста. Причина в теме:
          файл белый, а тёмная тема переворачивает эту половину в светлую —
          белый знак там исчезал бы. Плашка под ним эту беду лечила, но
          выглядела наклейкой поверх драпировки. Маска решает то же самое
          честно: знак живёт тем же цветом, что и заголовок рядом, и
          переворачивается вместе с ним.

          «Parda Bozor» осталось строкой ниже: в самом файле только
          «Design House», полное имя складывается из двух частей.
        */}
        <div className="relative flex flex-col items-start gap-4">
          <span
            role="img"
            aria-label="Design House Parda Bozor"
            className="block h-[115px] w-[180px] bg-current"
            style={{
              WebkitMaskImage: 'url(/logo.png)',
              maskImage: 'url(/logo.png)',
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
            }}
          />
          <span className="flex flex-col">
            <span className="font-display text-title tracking-[0.01em]">Parda Bozor</span>
            <span className="text-overline tracking-[0.05em] text-base/55">
              шторы премиум класса
            </span>
          </span>
        </div>

        <div className="relative flex max-w-[520px] flex-col gap-5">
          <p className="font-display text-[52px] leading-[1.06] tracking-[-0.01em] xl:text-[58px]">
            Заказ проходит восемь рук.{' '}
            <span className="italic text-accent-muted">Система помнит каждую.</span>
          </p>
          <p className="max-w-[430px] text-body leading-relaxed text-base/70">
            Замер, раскрой, пошив, контроль, установка — каждый переход записан: кто, когда
            и почему. Историю не переписать даже директору.
          </p>
        </div>

        <dl className="relative flex gap-10">
          {FACTS.map((fact) => (
            <div key={fact.label} className="flex flex-col gap-1">
              <dt className="sr-only">{fact.label}</dt>
              <dd className="font-mono text-title font-medium text-accent-muted">{fact.value}</dd>
              <p aria-hidden className="text-overline tracking-[0.04em] text-base/50">
                {fact.label}
              </p>
            </div>
          ))}
        </dl>
      </section>

      {/* --- Форма --------------------------------------------------------- */}
      <section className="flex items-center justify-center px-6 py-14 sm:px-16">
        <div className="flex w-full max-w-[380px] flex-col gap-7">
          {/*
            На узком экране фирменной половины нет — логотип возвращается
            сюда. Той же маской: здесь фон светлый, и знак становится
            тёмным сам, без отдельного файла под светлую тему.
          */}
          <div className="flex items-center gap-3 lg:hidden">
            <span
              role="img"
              aria-label="Design House"
              className="block h-8 w-[50px] shrink-0 bg-current text-primary"
              style={{
                WebkitMaskImage: 'url(/logo.png)',
                maskImage: 'url(/logo.png)',
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
              }}
            />
            <span className="font-display text-title">Parda Bozor</span>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="font-display text-display leading-[1.15] text-primary">Вход в систему</h1>
            <p className="text-caption leading-relaxed text-secondary">
              Введите рабочий номер телефона и пароль
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <label className="flex flex-col gap-1.5">
              <span className="text-overline uppercase tracking-[0.08em] text-muted">
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
                className="w-full rounded-lg border border-strong bg-panel px-3.5 py-2.5 font-mono text-body text-primary placeholder:text-muted/70 focus:border-accent focus:outline-none"
              />
              {fieldErrors?.['phone']?.[0] !== undefined && (
                <span className="text-footnote text-danger">{fieldErrors['phone'][0]}</span>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-overline uppercase tracking-[0.08em] text-muted">Пароль</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                placeholder="••••••••"
                className="w-full rounded-lg border border-strong bg-panel px-3.5 py-2.5 font-mono text-body tracking-[0.14em] text-primary placeholder:text-muted/70 focus:border-accent focus:outline-none"
              />
            </label>

            {loginMutation.error !== null && fieldErrors === null && (
              <p
                role="alert"
                className="rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-caption text-danger"
              >
                {loginMutation.error.message}
              </p>
            )}

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-body font-medium text-on-accent transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loginMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Войти
            </button>
          </form>

          <div className="h-px bg-subtle" />

          <p className="text-caption leading-relaxed text-muted">
            Забыли пароль? Обратитесь к директору — сброс делает только он.
          </p>
        </div>
      </section>
    </main>
  );
}

/** Оттенки складок. Повторяются по кругу — четырёх хватает, чтобы не читался шаг. */
const DRAPE_TINTS = [
  'rgb(255 255 255 / 0.05)',
  'rgb(255 255 255 / 0.09)',
  'rgb(255 255 255 / 0.03)',
  'rgb(255 255 255 / 0.07)',
  'rgb(255 255 255 / 0.05)',
  'rgb(255 255 255 / 0.09)',
  'rgb(255 255 255 / 0.03)',
  'rgb(255 255 255 / 0.07)',
  'rgb(255 255 255 / 0.05)',
  'rgb(255 255 255 / 0.09)',
  'rgb(255 255 255 / 0.03)',
  'rgb(255 255 255 / 0.07)',
  'rgb(255 255 255 / 0.05)',
  'rgb(255 255 255 / 0.09)',
];

/**
 * Три числа о системе.
 *
 * Все три — факты из кода, а не рекламные цифры: `ORDER_STATUSES` содержит
 * 17 значений, `PRODUCTION_STAGES` — 8, а статус пишется единственной функцией
 * `changeOrderStatus()`, которая всегда добавляет запись в историю.
 */
const FACTS = [
  { value: '17', label: 'статусов заказа' },
  { value: '8', label: 'этапов производства' },
  { value: '0', label: 'переходов без следа' },
] as const;
