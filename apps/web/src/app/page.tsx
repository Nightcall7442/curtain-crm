'use client';

import { DEPARTMENT_LABELS, formatPhone, toTelHref, type Department } from '@curtain-crm/shared';
import { animate, stagger, utils } from 'animejs';
import { MapPin } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, type ReactElement, type RefObject } from 'react';

import { useLocale } from '@/components/providers/LocaleProvider';
import { Skeleton } from '@/components/ui/Card';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

/**
 * Публичный лендинг — то, что открывает домен ДО входа в систему.
 *
 * Аудитория другая, чем у всей остальной панели: не сотрудник, который
 * ищет заказ, а клиент, который выбирает мастерскую. Поэтому страница не
 * переиспользует `Shell` (меню и шапку для вошедших) и живёт в корне,
 * а сама панель заказов переехала в `/dashboard` — см. `AuthProvider.tsx`
 * и `Shell.tsx`, где корень объявлен публичным маршрутом.
 *
 * Раздел «Команда» — единственное место на странице, где данные настоящие,
 * а не стоковые: фотографии берутся из `users.publicTeam` (см. эту
 * процедуру в `users.router.ts`). Она отдаёт только тех, у кого загружено
 * фото, и только имя, должность и подразделение — без телефона и ролей,
 * которые есть в `users.list` для панели.
 *
 * Заголовки набраны отдельным шрифтом (`font-editorial`, Playfair Display),
 * а не общим `font-display` панели (Instrument Serif): у того нет
 * кириллицы, и русский с узбекским текстом молча падал бы на Georgia из
 * запасного набора — тот самый безликий шрифт, которым и выдаёт себя
 * нетронутая вёрстка. Подробности — в `layout.tsx` рядом с объявлением.
 */
export default function LandingPage(): ReactElement {
  const { locale, setLocale } = useLocale();
  const c = locale === 'uz' ? COPY.uz : COPY.ru;

  return (
    <div className="min-h-screen bg-base text-primary">
      {/*
        Подстраховка на случай отключённого JavaScript.

        Разделы ниже экрана размечены классом `.reveal-item` и стартуют
        прозрачными — их проявляет `useScrollReveal` при прокрутке.
        Без скрипта проявлять их нечему, и текст остался бы невидимым
        навсегда — спрятанный насовсем хуже, чем показанный без анимации.
      */}
      <noscript>
        <style>{'.reveal-item { opacity: 1 !important; transform: none !important; }'}</style>
      </noscript>

      <SiteHeader copy={c} locale={locale} onLocaleChange={setLocale} />

      <main>
        <Hero copy={c} />
        <Marquee copy={c} />
        <About copy={c} />
        <Process copy={c} />
        <Team copy={c} locale={locale} />
        <Gallery copy={c} />
        <Contact copy={c} />
      </main>

      <SiteFooter copy={c} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Анимации при прокрутке                            */
/* -------------------------------------------------------------------------- */

/**
 * Проявляет `.reveal-item` внутри секции, когда та входит в область
 * видимости — один раз, не на каждую прокрутку туда-обратно.
 *
 * `IntersectionObserver`, а не привязка к скроллу через `animejs`: секция
 * либо появилась, либо нет, и для такого сигнала не нужен пересчёт на
 * каждый кадр прокрутки — обсервер дешевле и это именно то, для чего
 * браузер его и даёт.
 *
 * Системную настройку «уменьшить движение» уважаем: элементы сразу
 * ставятся в конечное положение, без единого кадра анимации.
 */
function useScrollReveal(options?: {
  readonly stagger?: number;
  readonly ease?: string;
}): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement | null>(null);
  const staggerMs = options?.stagger ?? 90;
  const ease = options?.ease ?? 'outQuad';

  useEffect(() => {
    const root = ref.current;
    if (root === null) return;

    const items = root.querySelectorAll<HTMLElement>('.reveal-item');
    if (items.length === 0) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      utils.set(items, { opacity: 1, translateY: 0, scale: 1 });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry === undefined || !entry.isIntersecting) return;

        animate(items, {
          opacity: [0, 1],
          translateY: [28, 0],
          duration: 800,
          delay: stagger(staggerMs),
          ease,
        });
        observer.disconnect();
      },
      { threshold: 0.15 },
    );

    observer.observe(root);
    return () => {
      observer.disconnect();
    };
  }, [staggerMs, ease]);

  return ref;
}

/* -------------------------------------------------------------------------- */
/*                                   Шапка                                    */
/* -------------------------------------------------------------------------- */

function SiteHeader({
  copy,
  locale,
  onLocaleChange,
}: {
  readonly copy: LandingCopy;
  readonly locale: 'ru' | 'uz';
  readonly onLocaleChange: (next: 'ru' | 'uz') => void;
}): ReactElement {
  return (
    <header className="glass-nav glass-edge sticky top-0 z-30">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-3">
          <span
            aria-hidden
            className="block h-8 w-8 shrink-0 bg-nav-text"
            style={{
              WebkitMaskImage: 'url(/logo.png)',
              maskImage: 'url(/logo.png)',
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
            }}
          />
          <span className="text-subhead font-semibold uppercase tracking-[0.22em] text-nav-text">
            Parda Bozor
          </span>
        </a>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Разделы страницы">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-caption font-medium text-nav-text/75 transition-colors hover:text-nav-text"
            >
              {copy.nav[link.key]}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          {/* Переключатель языка: две буквы, а не полный список — раздел
              «Настройки» панели уже показывает названия языков на них
              самих (LocalePicker), здесь для того же самого нет места. */}
          <div
            role="radiogroup"
            aria-label="Язык страницы"
            className="flex items-center gap-1 rounded-tile bg-nav-raised/60 p-1"
          >
            {(['ru', 'uz'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={locale === value}
                onClick={() => {
                  onLocaleChange(value);
                }}
                className={cn(
                  'rounded-[8px] px-2.5 py-1 text-footnote font-semibold uppercase transition-colors',
                  locale === value
                    ? 'bg-accent-bright text-on-accent'
                    : 'text-nav-text/60 hover:text-nav-text',
                )}
              >
                {value}
              </button>
            ))}
          </div>

          {/*
            Вход для сотрудников — сознательно неприметный: страница
            продаёт мастерскую клиенту, а не открывает панель, и крупная
            кнопка «Войти» рядом с CTA заказа спорила бы с ним за внимание.
          */}
          <Link
            href="/login"
            className="hidden text-caption font-medium text-nav-text/60 transition-colors hover:text-nav-text sm:block"
          >
            {copy.staffLogin}
          </Link>
        </div>
      </div>
    </header>
  );
}

const NAV_LINKS = [
  { key: 'about', href: '#about' },
  { key: 'process', href: '#process' },
  { key: 'team', href: '#team' },
  { key: 'gallery', href: '#gallery' },
  { key: 'contact', href: '#contact' },
] as const satisfies readonly { key: keyof LandingCopy['nav']; href: string }[];

/* -------------------------------------------------------------------------- */
/*                                   Герой                                    */
/* -------------------------------------------------------------------------- */

/**
 * Герой — единственное место с анимацией, которая играет СРАЗУ, а не по
 * прокрутке: он и так на экране в первый момент, дожидаться пересечения
 * с областью видимости здесь не нужно и не сработало бы.
 */
function Hero({ copy }: { readonly copy: LandingCopy }): ReactElement {
  const rootRef = useRef<HTMLElement | null>(null);
  const imageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const imageWrap = imageRef.current;
    if (root === null) return;

    const items = root.querySelectorAll<HTMLElement>('.reveal-item');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      utils.set(items, { opacity: 1, translateY: 0 });
      return;
    }

    animate(items, {
      opacity: [0, 1],
      translateY: [24, 0],
      duration: 900,
      delay: stagger(120, { start: 150 }),
      ease: 'outQuad',
    });

    // Медленное «дыхание» фотографии — классический приём витрины интерьера:
    // кадр не статичен, но движение настолько плавное, что не отвлекает от
    // заголовка. `alternate` без ограничения повторов — эффект длится, пока
    // человек на странице, а не заканчивается через одну итерацию.
    if (imageWrap !== null) {
      animate(imageWrap, {
        scale: [1, 1.06],
        duration: 16000,
        direction: 'alternate',
        loop: true,
        ease: 'inOutSine',
      });
    }
  }, []);

  return (
    <section
      id="top"
      ref={rootRef}
      className="relative flex min-h-[680px] items-center overflow-hidden"
    >
      <div ref={imageRef} className="absolute inset-0">
        <Image
          src={unsplash(PHOTOS.hero, 1600)}
          alt={copy.heroImageAlt}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </div>
      {/* Затемнение слева направо: заголовок стоит слева, и текст на светлом
          участке фотографии терял бы контраст без него. */}
      <div className="absolute inset-0 bg-gradient-to-r from-[rgb(11_20_16_/_0.86)] via-[rgb(11_20_16_/_0.58)] to-[rgb(11_20_16_/_0.18)]" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-7 px-6 py-24">
        <span className="reveal-item text-overline font-semibold uppercase tracking-[0.22em] text-white/70">
          {copy.heroEyebrow}
        </span>
        <h1 className="reveal-item max-w-3xl font-editorial text-[42px] leading-[1.08] tracking-[-0.01em] text-white sm:text-[58px] lg:text-[66px]">
          {copy.heroTitle}
        </h1>
        <p className="reveal-item max-w-xl text-body leading-relaxed text-white/80">
          {copy.heroSubtitle}
        </p>

        <div className="reveal-item mt-2 flex flex-wrap items-center gap-4">
          <a
            href="#contact"
            className="pressable rounded-tile bg-accent-bright px-6 py-3 text-caption font-semibold text-on-accent shadow-glow"
          >
            {copy.heroCtaPrimary}
          </a>
          <a
            href="#process"
            className="pressable rounded-tile border border-white/30 px-6 py-3 text-caption font-semibold text-white hover:bg-white/10"
          >
            {copy.heroCtaSecondary}
          </a>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Бегущая строка                              */
/* -------------------------------------------------------------------------- */

/**
 * Полоса с этапами производства — переход между тёмным героем и светлым
 * содержимым ниже. Не украшение ради украшения: те же пять слов ещё раз
 * встретятся заголовками в разделе «Процесс», и здесь они работают
 * анонсом, а не случайным орнаментом.
 */
function Marquee({ copy }: { readonly copy: LandingCopy }): ReactElement {
  const words = copy.processSteps.map((step) => step.title.toUpperCase()).join('   —   ');

  return (
    <div className="overflow-hidden border-y border-subtle bg-nav py-4" aria-hidden>
      {/* Дублируется дважды и уезжает на 50% своей ширины — второй проход
          неотличим от первого, и переход между циклами не виден. */}
      <div className="marquee-track flex w-max gap-8 whitespace-nowrap">
        {[0, 1].map((copyIndex) => (
          <span
            key={copyIndex}
            className="font-editorial text-heading tracking-[0.02em] text-nav-text/50"
          >
            {words}
            <span className="mx-8">—</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 О мастерской                               */
/* -------------------------------------------------------------------------- */

function About({ copy }: { readonly copy: LandingCopy }): ReactElement {
  const ref = useScrollReveal({ stagger: 120 });

  return (
    <section id="about" ref={ref} className="mx-auto max-w-6xl px-6 py-24">
      <div className="grid gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-20">
        <div className="reveal-item flex flex-col gap-6">
          <span className="section-title">{copy.aboutEyebrow}</span>

          {/* Крупное заявление, а не подпись под заголовком: страница
              открывается впечатлением с фотографией, здесь — коротким
              утверждением о том, чем мастерская отличается, прежде чем
              переходить к развёрнутому объяснению. */}
          <p className="font-editorial text-[30px] leading-[1.25] tracking-[-0.01em] sm:text-[36px]">
            {copy.aboutStatement}
          </p>

          <p className="max-w-xl text-body leading-relaxed text-secondary">{copy.aboutParagraph}</p>
        </div>

        {/* Кадр сдвинут вверх относительно текстовой колонки отрицательным
            отступом — на широком экране это и отличает журнальный разворот
            от двух одинаковых по высоте плиток. */}
        <div className="reveal-item flex flex-col gap-3 lg:-mt-10">
          <div className="relative aspect-[4/3] overflow-hidden rounded-panel shadow-raised">
            <Image
              src={unsplash(PHOTOS.about, 900)}
              alt={copy.aboutImageAlt}
              fill
              sizes="(min-width: 1024px) 440px, 100vw"
              className="object-cover"
            />
          </div>
          <p className="text-footnote uppercase tracking-[0.08em] text-muted">
            {copy.aboutImageCaption}
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Процесс                                  */
/* -------------------------------------------------------------------------- */

/**
 * Пять этапов — не придуманы для страницы, а взяты из самого производства:
 * это те же роли, между которыми в системе распределяется расценка заказа
 * (`packages/shared/src/constants/stageFee.ts`). Здесь ровно то, что
 * происходит с заказом на самом деле, только без внутренних терминов.
 *
 * Разметка — горизонтальная линия с нумерованными метками, а не карточки
 * с иконками: у мастерской это ПУТЬ, который проходит каждый заказ, а не
 * список независимых достоинств, и линия читает это буквально.
 */
function Process({ copy }: { readonly copy: LandingCopy }): ReactElement {
  const ref = useScrollReveal({ stagger: 100 });

  return (
    <section id="process" ref={ref} className="bg-panel py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="reveal-item mb-16 flex flex-col gap-3">
          <span className="section-title">{copy.processEyebrow}</span>
          <h2 className="font-editorial text-[32px] leading-tight sm:text-[38px]">
            {copy.processTitle}
          </h2>
        </div>

        <div className="relative">
          {/* Линия пути — за метками, во всю ширину ряда. Только на широком
              экране: в столбик она читалась бы как случайная черта сверху. */}
          <div aria-hidden className="absolute left-7 right-7 top-7 hidden h-px bg-strong lg:block" />

          <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-6">
            {copy.processSteps.map((step, index) => (
              <li key={step.title} className="reveal-item relative flex flex-col gap-4">
                <span className="relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-full border border-accent/40 bg-base font-editorial text-heading text-accent">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="text-heading font-semibold">{step.title}</h3>
                <p className="text-caption leading-relaxed text-secondary">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Команда                                  */
/* -------------------------------------------------------------------------- */

/**
 * Единственный раздел с настоящими фотографиями, не стоковыми: люди,
 * которые действительно шьют заказы. Круги разного размера и вразнобой по
 * высоте — витрина сильной команды, а не ряд документов на пропуск.
 */
function Team({
  copy,
  locale,
}: {
  readonly copy: LandingCopy;
  readonly locale: 'ru' | 'uz';
}): ReactElement | null {
  const team = trpc.users.publicTeam.useQuery();
  const ref = useScrollReveal({ stagger: 60, ease: 'outBack' });

  // Пока грузится или пусто — молчим. У совсем новой мастерской без единой
  // загруженной фотографии сотрудника раздел просто не появится: пустая
  // витрина с подписью «наша команда» смотрелась бы хуже, чем её отсутствие.
  if (team.isLoading) {
    return (
      <section id="team" className="mx-auto max-w-6xl px-6 py-24">
        <div className="flex justify-center gap-6">
          {[0, 1, 2, 3, 4].map((key) => (
            <Skeleton key={key} className="h-28 w-28 rounded-full" />
          ))}
        </div>
      </section>
    );
  }

  if (team.data === undefined || team.data.length === 0) return null;

  return (
    <section id="team" ref={ref} className="mx-auto max-w-6xl px-6 py-24">
      <div className="reveal-item mb-16 flex flex-col gap-3 text-center">
        <span className="section-title mx-auto">{copy.teamEyebrow}</span>
        <h2 className="font-editorial text-[32px] leading-tight sm:text-[38px]">{copy.teamTitle}</h2>
        <p className="mx-auto max-w-xl text-body text-secondary">{copy.teamSubtitle}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-x-6 gap-y-12 sm:gap-x-10">
        {team.data.map((member, index) => (
          <TeamCard key={member.id} member={member} locale={locale} index={index} />
        ))}
      </div>
    </section>
  );
}

/**
 * Размер и сдвиг по кругу — заданы индексом по кругу из четырёх, а не
 * случайно: страница выглядит одинаково у всех посетителей и при каждой
 * перезагрузке. Волна размеров (крупный–средний–средний–мелкий) не
 * привязана к должности: подчёркивать директора крупным кругом на витрине
 * значило бы говорить о статусе, а не о том, что мастерская сильна
 * командой целиком.
 */
const TEAM_RHYTHM = [
  { size: 132, lift: -10 },
  { size: 112, lift: 12 },
  { size: 118, lift: -4 },
  { size: 100, lift: 8 },
] as const;

function TeamCard({
  member,
  locale,
  index,
}: {
  readonly member: {
    readonly id: number;
    readonly fullName: string;
    readonly jobTitle: string | null;
    readonly department: Department;
    readonly avatarUrl: string;
  };
  readonly locale: 'ru' | 'uz';
  readonly index: number;
}): ReactElement {
  const role = member.jobTitle ?? DEPARTMENT_LABELS[locale][member.department];
  const rhythm = TEAM_RHYTHM[index % TEAM_RHYTHM.length] ?? TEAM_RHYTHM[0];

  return (
    <div
      className="reveal-item flex flex-col items-center gap-3 transition-transform duration-200 hover:-translate-y-1"
      style={{ transform: `translateY(${String(rhythm.lift)}px)`, width: rhythm.size }}
    >
      {/*
        Обычный `<img>`, а не `next/image`: адрес фото зависит от того, где
        крутится API (`localhost` в разработке, боевой домен в проде — и он
        может смениться), а оптимизатор требует объявить хост заранее в
        `next.config.ts`. Кругу такого размера адаптивные размеры всё равно
        не нужны, так что разница того не стоит.
      */}
      <div
        className="relative overflow-hidden rounded-full border-4 border-base shadow-raised"
        style={{ width: rhythm.size, height: rhythm.size }}
      >
        <img
          src={member.avatarUrl}
          alt={member.fullName}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="text-center">
        <p className="text-caption font-semibold leading-tight">{member.fullName}</p>
        <p className="text-footnote text-muted">{role}</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Галерея                                  */
/* -------------------------------------------------------------------------- */

function Gallery({ copy }: { readonly copy: LandingCopy }): ReactElement {
  const ref = useScrollReveal({ stagger: 80 });

  return (
    <section id="gallery" ref={ref} className="bg-panel py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="reveal-item mb-12 flex flex-col gap-3">
          <span className="section-title">{copy.galleryEyebrow}</span>
          <h2 className="font-editorial text-[32px] leading-tight sm:text-[38px]">
            {copy.galleryTitle}
          </h2>
        </div>

        {/* Первый снимок — на два столбца и обе строки: даёт сетке акцент,
            вместо ряда одинаковых плиток. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {PHOTOS.gallery.map((id, index) => {
            const alt = copy.galleryAlts[index] ?? copy.galleryTitle;
            return (
              <div
                key={id}
                className={cn(
                  'reveal-item group relative overflow-hidden rounded-panel bg-raised',
                  index === 0 ? 'col-span-2 row-span-2 aspect-square' : 'aspect-square',
                )}
              >
                <Image
                  src={unsplash(id, index === 0 ? 900 : 500)}
                  alt={alt}
                  fill
                  sizes={
                    index === 0 ? '(min-width: 640px) 480px, 100vw' : '(min-width: 640px) 240px, 50vw'
                  }
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
                {/* Подпись всплывает на наведении, а не лежит на снимке
                    всегда: с ней фотография отдыхает от текста, которого
                    и так много на странице. */}
                <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/75 to-transparent p-4 transition-transform duration-300 group-hover:translate-y-0">
                  <p className="text-footnote leading-snug text-white">{alt}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Контакты                                 */
/* -------------------------------------------------------------------------- */

function Contact({ copy }: { readonly copy: LandingCopy }): ReactElement {
  const ref = useScrollReveal({ stagger: 100 });
  const telHref = toTelHref(CONTACT_PHONE) ?? `tel:${CONTACT_PHONE}`;

  return (
    <section id="contact" ref={ref} className="mx-auto max-w-6xl px-6 py-24">
      <div className="reveal-item flex flex-col items-center gap-8 rounded-panel bg-nav px-8 py-16 text-center text-nav-text sm:px-14">
        <div className="flex flex-col gap-4">
          <h2 className="font-editorial text-[34px] leading-tight sm:text-[42px]">
            {copy.contactTitle}
          </h2>
          <p className="mx-auto max-w-lg text-body text-nav-text/75">{copy.contactSubtitle}</p>
        </div>

        <a
          href={telHref}
          className="pressable font-editorial text-[28px] tracking-[-0.01em] text-nav-text transition-colors hover:text-accent-bright sm:text-[34px]"
        >
          {formatPhone(CONTACT_PHONE)}
        </a>

        <span className="flex items-center gap-2 text-caption text-nav-text/60">
          <MapPin className="h-4 w-4" aria-hidden />
          {copy.contactCity}
        </span>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Подвал                                   */
/* -------------------------------------------------------------------------- */

function SiteFooter({ copy }: { readonly copy: LandingCopy }): ReactElement {
  return (
    <footer className="border-t border-subtle px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="text-caption text-muted">© {new Date().getFullYear()} Parda Bozor · Design House</p>
        <Link href="/login" className="text-caption text-muted underline-offset-4 hover:underline">
          {copy.staffLogin}
        </Link>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Фотографии и подписи                            */
/* -------------------------------------------------------------------------- */

/**
 * Стоковые фотографии Unsplash — своих снимков интерьеров у мастерской
 * пока нет. Формат `next/image` требует явный домен в `next.config.ts`
 * (уже добавлен). Идентификаторы устойчивые: это адрес самого файла на
 * CDN Unsplash, а не случайная выдача поиска, — при перезагрузке страницы
 * показываются те же фотографии.
 */
const PHOTOS = {
  hero: '1659282386282-d7145e593bad',
  about: '1578353022142-09264fd64295',
  gallery: [
    '1577926606472-fc6d3a33f7e1',
    '1577926382659-d34e9430e853',
    '1664112742143-6aa92230d9c6',
    '1617617495640-153230cf3408',
    '1706817969183-908d5b67d465',
    '1601000785676-f9b0ade234d3',
  ],
} as const;

function unsplash(id: string, width: number): string {
  return `https://images.unsplash.com/photo-${id}?w=${String(width)}&q=80&auto=format&fit=crop`;
}

/**
 * Телефон мастерской.
 *
 * ЗАГЛУШКА. Реального публичного номера в базе нет — набор `+998901234567`
 * в `packages/db/src/seed.ts` тестовый, а личный номер директора из
 * заметок публиковать без явного согласия нельзя: это необратимо и не
 * мне решать. Перед запуском заменить на настоящий рабочий номер.
 *
 * Telegram и Instagram сюда намеренно не добавлены: угадать чужой реальный
 * аккаунт — значит с большой вероятностью привести клиента не туда или на
 * страницу постороннего человека. Добавить эти ссылки — как только появятся
 * настоящие.
 */
const CONTACT_PHONE = '+998900000000';

interface ProcessStep {
  readonly title: string;
  readonly description: string;
}

interface LandingCopy {
  readonly nav: {
    readonly about: string;
    readonly process: string;
    readonly team: string;
    readonly gallery: string;
    readonly contact: string;
  };
  readonly staffLogin: string;
  readonly heroEyebrow: string;
  readonly heroTitle: string;
  readonly heroSubtitle: string;
  readonly heroCtaPrimary: string;
  readonly heroCtaSecondary: string;
  readonly heroImageAlt: string;
  readonly aboutEyebrow: string;
  readonly aboutStatement: string;
  readonly aboutParagraph: string;
  readonly aboutImageAlt: string;
  readonly aboutImageCaption: string;
  readonly processEyebrow: string;
  readonly processTitle: string;
  readonly processSteps: readonly ProcessStep[];
  readonly teamEyebrow: string;
  readonly teamTitle: string;
  readonly teamSubtitle: string;
  readonly galleryEyebrow: string;
  readonly galleryTitle: string;
  readonly galleryAlts: readonly string[];
  readonly contactTitle: string;
  readonly contactSubtitle: string;
  readonly contactCity: string;
}

const COPY: Record<'ru' | 'uz', LandingCopy> = {
  ru: {
    nav: { about: 'О нас', process: 'Как мы работаем', team: 'Команда', gallery: 'Работы', contact: 'Контакты' },
    staffLogin: 'Вход для сотрудников',
    heroEyebrow: 'Пошив штор на заказ',
    heroTitle: 'Шторы, сшитые под ваши окна, а не подогнанные под них',
    heroSubtitle:
      'Замер, ткань, пошив и установка — всё в одной мастерской в Ташкенте. Каждый заказ проходит контроль качества, прежде чем поехать к вам домой.',
    heroCtaPrimary: 'Обсудить заказ',
    heroCtaSecondary: 'Как мы работаем',
    heroImageAlt: 'Бордовые шторы у арочного окна',
    aboutEyebrow: 'О мастерской',
    aboutStatement: 'Мы не подгоняем шторы под окно — мы шьём их заново, под конкретное окно.',
    aboutParagraph:
      'Design House Parda Bozor шьёт шторы под заказ: от классических портьер до лёгкого тюля. Каждое изделие проходит через одну и ту же мастерскую — замерщика, швею и контролёра, — а не собирается из чужих полуфабрикатов. Это дольше, чем купить готовое, и ровно поэтому держится дольше.',
    aboutImageAlt: 'Ножницы, нитки и сантиметровая лента на рабочем столе мастерской',
    aboutImageCaption: 'Инструменты одной смены',
    processEyebrow: 'Процесс',
    processTitle: 'Путь заказа — от окна до окна',
    processSteps: [
      { title: 'Замер', description: 'Мастер выезжает на адрес и снимает точные размеры окна — на глаз шторы не шьют.' },
      { title: 'Раскрой', description: 'Ткань раскраивается по расчёту под конкретное окно, а не по готовому лекалу.' },
      { title: 'Пошив', description: 'Штора собирается швеёй в мастерской, шов к шву, под контролем на каждом этапе.' },
      { title: 'Контроль', description: 'Готовое изделие проверяется, прежде чем покинуть мастерскую.' },
      { title: 'Установка', description: 'Карниз и штора вешаются на месте — заказ считается закрытым, когда всё висит как надо.' },
    ],
    teamEyebrow: 'Команда',
    teamTitle: 'Люди, которые шьют ваши шторы',
    teamSubtitle: 'За каждым заказом — конкретные мастера, а не безымянный цех.',
    galleryEyebrow: 'Работы',
    galleryTitle: 'Как это выглядит у клиентов',
    galleryAlts: [
      'Гостиная с золотистыми портьерами в три окна',
      'Золотистая штора с кружевным подкладом',
      'Тёмные деревянные двери со светлыми шторами',
      'Открытая дверь с лёгкой тюлевой шторой и видом на море',
      'Светлая штора у стены в тёплом свете',
      'Прозрачная штора у кресла с зелёной обивкой',
    ],
    contactTitle: 'Расскажите о своём окне',
    contactSubtitle: 'Подскажем модель и приедем на замер — обычно в течение нескольких дней.',
    contactCity: 'Ташкент',
  },
  uz: {
    nav: { about: 'Biz haqimizda', process: 'Ish jarayoni', team: 'Jamoa', gallery: 'Ishlarimiz', contact: 'Aloqa' },
    staffLogin: 'Xodimlar uchun kirish',
    heroEyebrow: 'Buyurtma asosida parda tikish',
    heroTitle: 'Derazangizga moslab tikilgan parda — tayyorini moslashtirish emas',
    heroSubtitle:
      "O'lchov, mato, tikuv va o'rnatish — barchasi Toshkentdagi bitta ustaxonada. Har bir buyurtma uyingizga jo'nashdan oldin sifat nazoratidan o'tadi.",
    heroCtaPrimary: 'Buyurtmani muhokama qilish',
    heroCtaSecondary: 'Ish jarayoni',
    heroImageAlt: 'Gumbazsimon deraza yonidagi to‘q qizil pardalar',
    aboutEyebrow: 'Ustaxona haqida',
    aboutStatement: "Biz pardani derazaga moslamaymiz — uni aynan shu deraza uchun qaytadan tikamiz.",
    aboutParagraph:
      "Design House Parda Bozor pardalarni buyurtma asosida tikadi: klassik pardalardan yengil tyulgacha. Har bir buyurtma bitta ustaxonadan — o'lchovchi, tikuvchi va nazoratchidan — o'tadi, boshqa joydan tayyor qismlar yig'ilmaydi. Bu tayyorini sotib olishdan sekinroq, va aynan shu sababli uzoqroq xizmat qiladi.",
    aboutImageAlt: 'Ustaxona stolidagi qaychi, ip va santimetr lenta',
    aboutImageCaption: 'Bir smena asboblari',
    processEyebrow: 'Jarayon',
    processTitle: "Buyurtma yo'li — derazadan derazagacha",
    processSteps: [
      { title: "O'lchov", description: "Usta manzilga borib, deraza o'lchamlarini aniq oladi — parda ko'zbo'yamachilikda tikilmaydi." },
      { title: 'Kesish', description: "Mato aynan shu deraza uchun hisob-kitob asosida kesiladi, tayyor andoza bo'yicha emas." },
      { title: 'Tikuv', description: 'Parda ustaxonada tikuvchi tomonidan tikiladi, har bosqichda nazorat ostida.' },
      { title: 'Nazorat', description: 'Tayyor mahsulot ustaxonadan chiqishdan oldin tekshiriladi.' },
      { title: "O'rnatish", description: "Karniz va parda joyida o'rnatiladi — hammasi kerakli tarzda osilganda buyurtma yakunlangan hisoblanadi." },
    ],
    teamEyebrow: 'Jamoa',
    teamTitle: 'Pardangizni tikadigan odamlar',
    teamSubtitle: 'Har bir buyurtma ortida aniq ustalar bor, nomsiz sex emas.',
    galleryEyebrow: 'Ishlarimiz',
    galleryTitle: "Mijozlarda qanday ko'rinadi",
    galleryAlts: [
      'Uch derazali mehmonxonada tilla rangli pardalar',
      "To'r pardali tilla rangli parda",
      "Yengil pardali to'q rangli yog'och eshiklar",
      'Dengiz manzarali ochiq eshik va yengil tyul parda',
      "Issiq yorug'likda devor yonidagi och rangli parda",
      'Yashil mebelli kreslo yonidagi shaffof parda',
    ],
    contactTitle: 'Derazangiz haqida gapirib bering',
    contactSubtitle: "Model tavsiya qilamiz va o'lchovga kelamiz — odatda bir necha kun ichida.",
    contactCity: 'Toshkent',
  },
};
