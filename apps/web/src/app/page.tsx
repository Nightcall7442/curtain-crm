'use client';

import { DEPARTMENT_LABELS, formatPhone, toTelHref, type Department } from '@curtain-crm/shared';
import { animate, stagger, utils } from 'animejs';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, type ReactElement, type RefObject } from 'react';

import { ProcessFilm } from '@/components/landing/ProcessFilm';
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
        <About copy={c} />
        <Process copy={c} />
        <Team copy={c} locale={locale} />
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
  /**
   * Содержимое раздела уже отрисовано.
   *
   * Разделу, который ждёт ответа сервера, этого мало по умолчанию: эффект
   * привязывается один раз, и в тот момент на месте раздела ещё заглушка —
   * ни узла, ни блоков `.reveal-item`. Наблюдатель не ставится, таймер не
   * заводится, а когда данные приходят, повторить эффекту нечего: список
   * зависимостей не менялся. Раздел остаётся прозрачным навсегда — ровно
   * так «Команда» и пропала со страницы, хотя фотографии сервер отдавал.
   */
  readonly ready?: boolean;
}): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement | null>(null);
  const staggerMs = options?.stagger ?? 90;
  const ease = options?.ease ?? 'outQuad';
  const ready = options?.ready ?? true;

  useEffect(() => {
    const root = ref.current;
    if (root === null) return;

    const items = root.querySelectorAll<HTMLElement>('.reveal-item');
    if (items.length === 0) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      utils.set(items, { opacity: 1, translateY: 0, scale: 1 });
      return;
    }

    /** Конечное состояние без анимации — то, чем всё должно закончиться. */
    const settle = (): void => {
      for (const item of items) {
        item.style.opacity = '1';
        item.style.transform = 'none';
      }
    };

    let revealed = false;
    let settleTimer = 0;

    const reveal = (): void => {
      if (revealed) return;
      revealed = true;
      clearTimeout(fallbackTimer);
      observer.disconnect();

      animate(items, {
        opacity: [0, 1],
        translateY: [28, 0],
        duration: 800,
        delay: stagger(staggerMs),
        ease,
      });

      /*
        Второй таймер — уже после запуска анимации.

        Первой подстраховки мало: она снимается ровно в тот момент, когда
        секция попала в кадр, и дальше всё держится на твине. А твин идёт по
        кадрам, которых в фоновой вкладке нет: раздел «появился», анимация
        не сыграла ни разу, страховки больше нет — и текст остаётся
        невидимым до самой перезагрузки. Этот таймер дописывает конечное
        состояние независимо от кадров; если анимация всё же сыграла, он
        ставит ровно те же значения, что она и так поставила.
      */
      settleTimer = window.setTimeout(settle, 900 + staggerMs * items.length);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting === true) reveal();
      },
      { threshold: 0.15 },
    );
    observer.observe(root);

    /*
      Подстраховка по таймеру, без анимации: просто ставит конечные значения.

      `IntersectionObserver` сам по себе не пострадал бы от фоновой вкладки —
      он не зависит от `requestAnimationFrame`. Но АНИМАЦИЯ, которую он
      запускает, зависит, и в браузере, поставившем rAF вкладки на паузу
      (та же история, что и у героя, только здесь секция ждёт прокрутки, а
      не появляется сразу), твин заморозился бы на первом кадре — опять
      невидимый текст, только теперь ниже по странице. Пять секунд — заведомо
      больше, чем нужно настоящему проявлению по прокрутке.
    */
    const fallbackTimer = window.setTimeout(() => {
      if (revealed) return;
      revealed = true;
      observer.disconnect();
      settle();
    }, 5000);

    return () => {
      observer.disconnect();
      clearTimeout(fallbackTimer);
      clearTimeout(settleTimer);
    };
  }, [staggerMs, ease, ready]);

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
  { key: 'styles', href: '#styles' },
  { key: 'about', href: '#about' },
  { key: 'process', href: '#process' },
  { key: 'team', href: '#team' },
  { key: 'contact', href: '#contact' },
] as const satisfies readonly { key: keyof LandingCopy['nav']; href: string }[];

/* -------------------------------------------------------------------------- */
/*                                   Герой                                    */
/* -------------------------------------------------------------------------- */

/**
 * Герой — единственное место с анимацией, которая играет СРАЗУ, а не по
 * прокрутке: он и так на экране в первый момент, дожидаться пересечения
 * с областью видимости здесь не нужно и не сработало бы.
 *
 * Композиция — по референсу владельца: тёмная панель слева (знак, заголовок,
 * значки преимуществ, кнопка) и фотография интерьера справа во всю высоту,
 * а не текст поверх затемнённого снимка, как было раньше. Тёмная панель —
 * тот же `bg-nav`, что и в остальной панели: свой цвет здесь не заводится.
 */

/**
 * Золотой акцент и зелень первого экрана — только здесь.
 *
 * Не заведены токенами в `tailwind.config.ts`: акцент всей панели зелёный
 * («Хвоя»), и цвет витрины не должен звать себя туда, где кнопка входа или
 * карточка заказа возьмут его по имени. Здесь это ровно то, чем и названо —
 * цвета одного конкретного экрана.
 *
 * Зелень взята глубже, чем `bg-nav` панели: тот почти чёрный, и рядом с
 * тёплой фотографией читался как провал, а не как цвет. Референс владельца
 * держится именно на бутылочном зелёном с золотом.
 */
const GOLD = '#C9A227';
const GOLD_LIGHT = '#E4C77A';
const GREEN = '#0F3A2C';
const GREEN_DEEP = '#08201A';

/** Задержка запуска для N-го элемента героя, строкой для `animationDelay`. */
const heroDelay = (index: number): string => `${(150 + index * 120).toString()}ms`;

/**
 * Первый экран: панель с обещанием, фотография во всю высоту, под ними —
 * едущая витрина стилей и полоса показателей.
 *
 * Все четыре части — один экран, а не четыре секции подряд: в референсе
 * владельца они читаются как одна обложка, и разрывать её отступами значило
 * бы получить четыре одинаково важных блока вместо одного впечатления.
 */
function Hero({ copy }: { readonly copy: LandingCopy }): ReactElement {
  return (
    <section id="top" style={{ backgroundColor: GREEN_DEEP }}>
      {/*
        Один кадр во всю ширину, а зелень — заливкой поверх его левой части.

        Раньше здесь был жёсткий стык: слева плоская зелёная панель, справа
        фотография. Две половины читались как две разные картинки, поставленные
        рядом. В референсе владельца иначе — комната занимает весь экран, а
        текст лежит на зелёной дымке над ней, и именно это делает обложку
        цельной.
      */}
      <div className="relative isolate min-h-[560px] overflow-hidden lg:min-h-[680px]">
        <div className="hero-kenburns absolute inset-0">
          <Image
            src={unsplash(PHOTOS.hero, 2000)}
            alt={copy.heroImageAlt}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>

        {/*
          Заливка: плотная зелень слева, к середине сходит на нет. Текст
          живёт в её плотной части, поэтому контраст белого по зелёному остаётся
          прежним, а снимок при этом не обрезан пополам.
        */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(100deg, ${GREEN_DEEP} 0%, ${GREEN} 26%, rgb(15 58 44 / 0.86) 40%, rgb(15 58 44 / 0.35) 56%, transparent 72%),
              linear-gradient(0deg, rgb(8 32 26 / 0.6) 0%, transparent 34%)`,
          }}
        />

        <div className="relative flex min-h-[560px] flex-col justify-center gap-8 px-6 py-16 text-white sm:px-10 lg:min-h-[680px] lg:px-16 lg:py-20">
          <a
            href="#top"
            className="hero-enter flex flex-col items-start gap-3"
            style={{ animationDelay: heroDelay(0) }}
          >
            <span
              aria-hidden
              className="block h-[84px] w-[136px] bg-current"
              style={{
                color: GOLD_LIGHT,
                WebkitMaskImage: 'url(/logo.png)',
                maskImage: 'url(/logo.png)',
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'left',
                maskPosition: 'left',
              }}
            />
            <span className="text-overline uppercase tracking-[0.42em] text-white/55">
              {copy.heroWordmarkTagline}
            </span>
          </a>

          <div className="hero-enter flex flex-col gap-5" style={{ animationDelay: heroDelay(1) }}>
            <h1 className="max-w-[13ch] font-hero text-[clamp(34px,5vw,58px)] font-extrabold uppercase leading-[1.0] tracking-[-0.02em]">
              {copy.heroTitleLead}
              <br />
              <span style={{ color: GOLD_LIGHT }}>{copy.heroTitleAccent}</span>
            </h1>
            <p className="max-w-[26ch] text-body leading-relaxed text-white/75">
              {copy.heroSubtitle}
            </p>
          </div>

          {/*
            Четыре обещания — просто список, без отметок.

            Сначала здесь были иконки из общего набора (бриллиант, искорки,
            домик), потом — по золотому волоску над каждой подписью. И то и
            другое оказалось украшением: ни значок, ни штрих не говорили о
            шторах ничего, чего не сказала бы сама подпись, а четыре
            коротких черты в воздухе читались как случайные помарки.

            Линия осталась одна — над всем блоком: она отделяет обещание
            («создаём уют») от того, чем оно подтверждается.
          */}
          <div className="hero-enter" style={{ animationDelay: heroDelay(2) }}>
            <span aria-hidden className="block h-px w-16" style={{ backgroundColor: `${GOLD}80` }} />
            <ul className="mt-5 grid max-w-md grid-cols-2 gap-x-8 gap-y-3">
              {copy.heroBadges.map((badge) => (
                <li key={badge} className="text-caption leading-snug text-white/80">
                  {badge}
                </li>
              ))}
            </ul>
          </div>

          <a
            href="#styles"
            className="hero-enter pressable inline-flex w-fit items-center gap-3 rounded-full px-8 py-4 text-caption font-bold uppercase tracking-[0.12em]"
            style={{
              animationDelay: heroDelay(3),
              backgroundColor: GOLD_LIGHT,
              color: GREEN_DEEP,
            }}
          >
            {copy.heroCtaPrimary}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>

          <p
            aria-hidden
            className="hero-enter pointer-events-none absolute bottom-10 right-6 text-right font-script text-[clamp(24px,3.2vw,42px)] leading-[1.15] sm:right-10 lg:right-16"
            style={{ animationDelay: heroDelay(4), color: GOLD_LIGHT }}
          >
            Your Style
            <br />
            Our Inspiration
          </p>
        </div>
      </div>

      <StyleStrip copy={copy} />
      <StatsRail copy={copy} />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Витрина стилей                                */
/* -------------------------------------------------------------------------- */

/**
 * Шесть стилей мастерской, медленно едущих мимо.
 *
 * Это подпись экрана: не сетка, которую нужно разглядывать, а витрина,
 * которая проходит перед глазами сама. Скорость постоянная — 22 пикселя в
 * секунду, независимо от ширины экрана и числа карточек: считается от
 * измеренной ширины ленты, а не задаётся на глаз одним числом секунд,
 * которое на широком мониторе превратилось бы в галоп.
 *
 * Движение ведёт `animejs`, а не CSS: на нём же держатся пауза при
 * наведении и остановка на фокусе с клавиатуры — читать подпись движущейся
 * карточки невозможно, а прочитать её хочет как раз тот, кто навёл.
 *
 * Лента дублируется дважды и уезжает ровно на ширину одного прохода: второй
 * проход — копия первого, поэтому момент возврата в начало не виден.
 */
/**
 * Лента, медленно едущая мимо, — общий двигатель витрины стилей и команды.
 *
 * Скорость постоянная — 22 пикселя в секунду, независимо от ширины экрана и
 * числа карточек: считается от измеренной ширины ленты, а не задаётся на
 * глаз одним числом секунд, которое на широком мониторе превратилось бы в
 * галоп. Движение ведёт `animejs`, а не CSS: на нём же держатся пауза при
 * наведении и остановка на фокусе с клавиатуры.
 *
 * Лента дублируется дважды и уезжает ровно на ширину одного прохода: второй
 * проход — копия первого, поэтому момент возврата в начало не виден.
 */
function useDrift(trackRef: RefObject<HTMLDivElement | null>): {
  readonly hold: () => void;
  readonly release: () => void;
} {
  const driftRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (track === null) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let cancelled = false;

    /* Ширину меряем после раскладки: до неё `scrollWidth` равен нулю, и
       анимация получила бы нулевую дистанцию — лента стояла бы на месте. */
    const start = (): void => {
      if (cancelled) return;

      const distance = track.scrollWidth / 2;
      if (distance < 1) {
        window.requestAnimationFrame(start);
        return;
      }

      driftRef.current?.pause();
      driftRef.current = animate(track, {
        x: [0, -distance],
        duration: (distance / 22) * 1000,
        ease: 'linear',
        loop: true,
      });
    };

    start();

    /* Ширина карточек зависит от ширины экрана — при повороте телефона или
       изменении окна дистанция другая, и старая анимация уехала бы не туда. */
    const observer = new ResizeObserver(() => {
      utils.set(track, { x: 0 });
      start();
    });
    observer.observe(track);

    return () => {
      cancelled = true;
      observer.disconnect();
      driftRef.current?.pause();
    };
  }, [trackRef]);

  return {
    hold: () => {
      driftRef.current?.pause();
    },
    release: () => {
      driftRef.current?.play();
    },
  };
}

function StyleStrip({ copy }: { readonly copy: LandingCopy }): ReactElement {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const { hold, release } = useDrift(trackRef);

  return (
    <section
      id="styles"
      aria-label={copy.stylesTitle}
      className="overflow-hidden"
      style={{ backgroundColor: GREEN_DEEP }}
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocus={hold}
      onBlur={release}
    >
      <h2 className="sr-only">{copy.stylesTitle}</h2>

      <div ref={trackRef} className="flex w-max gap-4 px-4 pb-6 pt-2">
        {[0, 1].map((pass) =>
          copy.styles.map((style) => (
            <a
              key={`${pass.toString()}-${style.name}`}
              href="#contact"
              /* Второй проход — копия первого, для читалки это повтор одного
                 и того же: озвучивать его незачем. */
              {...(pass === 1 ? { 'aria-hidden': true, tabIndex: -1 } : {})}
              className="group relative block aspect-[4/5] w-[clamp(200px,17vw,246px)] shrink-0 overflow-hidden rounded-[14px]"
            >
              <Image
                src={unsplash(PHOTOS.styles[style.photo], 560)}
                alt=""
                fill
                sizes="246px"
                className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.08]"
              />
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'linear-gradient(180deg, rgb(8 32 26 / 0.15) 0%, rgb(8 32 26 / 0.82) 100%)',
                }}
              />
              {/* Золотая линия у нижнего края появляется под курсором —
                  единственная реакция карточки, кроме приближения кадра. */}
              {/* Золотая рамка проступает под курсором — вместо подчёркивания:
                  у плитки со скруглением линия по нижнему краю обрывалась
                  в углах и читалась браком вёрстки. */}
              <span
                aria-hidden
                className="absolute inset-0 rounded-[14px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{ boxShadow: `inset 0 0 0 1px ${GOLD_LIGHT}` }}
              />
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-5">
                {/* Название засечным, как в референсе: гротеск капсом рядом с
                    фотографией интерьера читается ценником, а не подписью к
                    стилю. */}
                <span className="font-editorial text-[19px] uppercase leading-none tracking-[0.02em] text-white">
                  {style.name}
                </span>
                <span className="text-footnote leading-snug text-white/65">{style.caption}</span>
              </div>
            </a>
          )),
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Полоса показателей                             */
/* -------------------------------------------------------------------------- */

/**
 * Знак, три числа и девиз — подошва первого экрана.
 *
 * Числа подкручиваются от нуля, когда полоса попадает в поле зрения:
 * `animejs` считает их по кадрам, а не CSS — счётчик это изменение ТЕКСТА,
 * а не оформления, и переходами CSS оно не выражается вовсе.
 */
function StatsRail({ copy }: { readonly copy: LandingCopy }): ReactElement {
  const stats = [
    { value: copy.statsClientsValue, label: copy.statsClientsLabel },
    { value: copy.statsFabricsValue, label: copy.statsFabricsLabel },
    { value: copy.statsYearsValue, label: copy.statsYearsLabel },
  ] as const;

  return (
    <div style={{ backgroundColor: GREEN_DEEP }}>
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-8 px-6 py-7 lg:flex-row lg:justify-between lg:gap-10">
        <span
          aria-hidden
          className="hidden h-9 w-32 shrink-0 bg-current lg:block"
          style={{
            color: `${GOLD_LIGHT}99`,
            WebkitMaskImage: 'url(/logo.png)',
            maskImage: 'url(/logo.png)',
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'left',
            maskPosition: 'left',
          }}
        />

        <dl className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-4">
              <span aria-hidden className="h-8 w-px" style={{ backgroundColor: `${GOLD}59` }} />
              <div>
                <dd className="font-hero text-[26px] font-extrabold leading-none text-white">
                  <CountUp value={stat.value} />
                </dd>
                <dt className="mt-1 text-footnote text-white/55">{stat.label}</dt>
              </div>
            </div>
          ))}
        </dl>

        <p
          className="text-overline font-semibold uppercase tracking-[0.28em] text-white/45"
          style={{ maxWidth: '13rem' }}
        >
          {copy.statsTagline}
        </p>
      </div>
    </div>
  );
}

/**
 * Число, которое подкручивается от нуля до своего значения.
 *
 * Значение приходит строкой («1000+», «5»): считается только числовая часть,
 * а хвост вроде плюса дописывается как есть. Разбирать формат числа здесь,
 * а не хранить его разобранным в тексте, — чтобы у перевода оставалась
 * возможность написать «5 лет» иначе, не ломая счётчик.
 */
function CountUp({ value }: { readonly value: string }): ReactElement {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;

    const match = /\d+/.exec(value);
    if (match === null) return;

    const target = Number.parseInt(match[0], 10);
    const suffix = value.slice(match.index + match[0].length);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let played = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (played || !entries.some((entry) => entry.isIntersecting)) return;
        played = true;
        observer.disconnect();

        const counter = { n: 0 };
        const settle = (): void => {
          node.textContent = value;
        };

        animate(counter, {
          n: target,
          duration: 1400,
          ease: 'outQuad',
          onUpdate: () => {
            node.textContent = `${Math.round(counter.n).toString()}${suffix}`;
          },
          onComplete: settle,
        });

        /*
          Страховка на замирание кадров.

          Браузер останавливает `requestAnimationFrame` во вкладке, открытой
          в фоне. Счётчик, начавший считать перед тем, как вкладку свернули,
          замирает на полуслове — и «1000+ клиентов» показывается как «45+»
          до самой перезагрузки. Таймер идёт независимо от кадров и дописывает
          конечное значение, даже если анимацию досчитать не дали.
        */
        window.setTimeout(settle, 2200);
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [value]);

  return <span ref={ref}>{value}</span>;
}

/* -------------------------------------------------------------------------- */
/*                            Общее для разделов                              */
/* -------------------------------------------------------------------------- */

/** Кремовый разворот — вторая половина пары к бутылочной зелени обложки. */
const CREAM = '#F5F1E8';

/**
 * Надзаголовок раздела: золотая черта и слово вразрядку.
 *
 * Черта, а не точка или иконка: тем же золотым волоском набраны линия
 * процесса и подчёркивание карточки стиля — одна деталь, повторённая
 * трижды, держит страницу вместе крепче трёх разных.
 */
function Eyebrow({
  children,
  tone,
}: {
  readonly children: string;
  readonly tone: 'onGreen' | 'onCream';
}): ReactElement {
  return (
    <span className="flex items-center gap-3 text-overline font-semibold uppercase tracking-[0.28em]">
      <span aria-hidden className="h-px w-8" style={{ backgroundColor: GOLD }} />
      <span style={{ color: tone === 'onGreen' ? GOLD_LIGHT : '#7A6A3F' }}>{children}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 О мастерской                               */
/* -------------------------------------------------------------------------- */

/**
 * Разворот-заявление — с кадром из собственного ролика.
 *
 * Стоковый снимок ниток и ножниц владелец назвал чужим, а раздел без
 * фотографии рядом с обложкой выглядел пустым. Кадр мастерской из ролика
 * «Путь заказа» — не сток: это тот же цех, что этажом ниже листает
 * прокрутка. Зелёная дымка по краю кадра — та же, что на обложке: одна
 * деталь, повторённая, держит страницу вместе.
 *
 * Заявление набрано тем же капсом, что заголовок обложки, а не засечным:
 * два шрифта для одного голоса читались как две страницы, склеенные вместе.
 */
function About({ copy }: { readonly copy: LandingCopy }): ReactElement {
  const ref = useScrollReveal({ stagger: 120 });

  return (
    <section id="about" ref={ref} style={{ backgroundColor: CREAM }}>
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:py-28">
        <div className="reveal-item relative aspect-[4/5] overflow-hidden rounded-[18px] lg:aspect-auto lg:min-h-[560px]">
          <img
            src={FILM_STILLS.cutting}
            alt={copy.aboutImageAlt}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(200deg, transparent 55%, rgb(8 32 26 / 0.55) 100%)',
            }}
          />
          <span
            aria-hidden
            className="absolute inset-0 rounded-[18px]"
            style={{ boxShadow: `inset 0 0 0 1px ${GOLD}40` }}
          />
        </div>

        <div className="flex flex-col justify-center gap-8">
          <div className="reveal-item">
            <Eyebrow tone="onCream">{copy.aboutEyebrow}</Eyebrow>
          </div>

          <h2
            className="reveal-item font-hero text-[clamp(26px,3.2vw,42px)] font-extrabold uppercase leading-[1.04] tracking-[-0.02em]"
            style={{ color: GREEN_DEEP }}
          >
            {copy.aboutStatement}
          </h2>

          <span aria-hidden className="reveal-item h-px w-16" style={{ backgroundColor: `${GOLD}80` }} />

          <p
            className="reveal-item max-w-xl text-body leading-[1.75]"
            style={{ color: 'rgb(31 45 39 / 0.72)' }}
          >
            {copy.aboutParagraph}
          </p>

          {/* Четыре обещания с обложки — здесь они раскрыты одной строкой каждое. */}
          <ul className="reveal-item grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {copy.aboutPoints.map((point) => (
              <li key={point.title} className="flex flex-col gap-1 border-l pl-4" style={{ borderColor: `${GOLD}66` }}>
                <span className="text-caption font-semibold" style={{ color: GREEN_DEEP }}>
                  {point.title}
                </span>
                <span className="text-footnote leading-snug" style={{ color: 'rgb(31 45 39 / 0.6)' }}>
                  {point.text}
                </span>
              </li>
            ))}
          </ul>
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
 * (`packages/shared/src/constants/stageFee.ts`).
 *
 * Порядок здесь несёт смысл, поэтому это список, а не сетка достоинств. Но
 * номера в кружках убраны: 01–05 крупнее и контрастнее самих названий
 * этапов, и первым читалось «ноль один», а не «замер». Очерёдность и так
 * задана положением на линии — золотой волосок проходит через все пять
 * засечек, слева направо. Ровно то же, что говорили цифры, только не
 * заслоняя собой содержание.
 */
function Process({ copy }: { readonly copy: LandingCopy }): ReactElement {
  const ref = useScrollReveal({ stagger: 100 });

  return (
    <section id="process" ref={ref} style={{ backgroundColor: GREEN }}>
      {/*
        Путь заказа — ролик, который листает прокрутка (см. `ProcessFilm`).
        Пять шагов ниже остались: это тот же путь словами, для тех, кто
        читает быстрее, чем крутит, и для поисковика.
      */}
      <ProcessFilm steps={copy.processSteps} eyebrow={copy.processEyebrow} title={copy.processTitle} />

      <div className="mx-auto max-w-6xl px-6 py-20">

        <ol className="relative grid gap-12 sm:grid-cols-2 lg:grid-cols-5 lg:gap-8">
          {/* Линия пути — за засечками, во всю ширину ряда. Только на широком
              экране: в столбик она читалась бы случайной чертой сверху. */}
          <span
            aria-hidden
            className="absolute left-0 right-0 top-[5px] hidden h-px lg:block"
            style={{ backgroundColor: `${GOLD}40` }}
          />

          {copy.processSteps.map((step) => (
            <li key={step.title} className="reveal-item relative flex flex-col gap-4">
              {/* Засечка на линии: ромб, повёрнутый квадрат — он читается
                  как отметка на шкале, а круг читался бы как кнопка. */}
              <span
                aria-hidden
                className="h-[11px] w-[11px] rotate-45"
                style={{ backgroundColor: GOLD_LIGHT }}
              />
              <h3 className="text-heading font-semibold text-white">{step.title}</h3>
              <p className="text-caption leading-relaxed text-white/60">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Команда                                  */
/* -------------------------------------------------------------------------- */

/**
 * Единственный раздел с настоящими фотографиями, не стоковыми: люди,
 * которые действительно шьют заказы.
 *
 * Карточки едут лентой — той же, что витрина стилей на обложке: фото во
 * всю плитку, зелёная дымка снизу, имя и должность на ней. Шестнадцать
 * кругов сеткой читались доской пропусков; лента — витрина мастеров.
 */
function Team({
  copy,
  locale,
}: {
  readonly copy: LandingCopy;
  readonly locale: 'ru' | 'uz';
}): ReactElement | null {
  const team = trpc.users.publicTeam.useQuery();
  const ref = useScrollReveal({ stagger: 60, ready: team.data !== undefined });
  const trackRef = useRef<HTMLDivElement | null>(null);
  const { hold, release } = useDrift(trackRef);

  // Пока грузится или пусто — молчим. У совсем новой мастерской без единой
  // загруженной фотографии сотрудника раздел просто не появится: пустая
  // витрина с подписью «наша команда» смотрелась бы хуже, чем её отсутствие.
  if (team.isLoading) {
    return (
      <section id="team" className="px-6 py-24" style={{ backgroundColor: GREEN }}>
        <div className="flex justify-center gap-4">
          {[0, 1, 2, 3, 4].map((key) => (
            <Skeleton key={key} className="h-56 w-44 rounded-[14px]" />
          ))}
        </div>
      </section>
    );
  }

  if (team.data === undefined || team.data.length === 0) return null;

  return (
    <section
      id="team"
      ref={ref}
      className="overflow-hidden py-20 lg:py-24"
      style={{ backgroundColor: GREEN }}
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocus={hold}
      onBlur={release}
    >
      <div className="mx-auto mb-12 flex max-w-6xl flex-col gap-4 px-6">
        <div className="reveal-item">
          <Eyebrow tone="onGreen">{copy.teamEyebrow}</Eyebrow>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="reveal-item font-hero text-[clamp(28px,3.4vw,42px)] font-extrabold uppercase leading-[1.04] tracking-[-0.02em] text-white">
            {copy.teamTitle}
          </h2>
          <p className="reveal-item max-w-md text-body leading-relaxed text-white/65">{copy.teamSubtitle}</p>
        </div>
      </div>

      <div ref={trackRef} className="flex w-max gap-4 px-4">
        {[0, 1].map((pass) =>
          team.data.map((member) => (
            <TeamCard
              key={`${pass.toString()}-${member.id.toString()}`}
              member={member}
              locale={locale}
              hidden={pass === 1}
            />
          )),
        )}
      </div>
    </section>
  );
}

function TeamCard({
  member,
  locale,
  hidden,
}: {
  readonly member: {
    readonly id: number;
    readonly fullName: string;
    readonly jobTitle: string | null;
    readonly department: Department;
    readonly avatarUrl: string;
  };
  readonly locale: 'ru' | 'uz';
  /** Второй проход ленты — копия первого; читалке его озвучивать незачем. */
  readonly hidden: boolean;
}): ReactElement {
  const role = member.jobTitle ?? DEPARTMENT_LABELS[locale][member.department];

  return (
    <div
      {...(hidden ? { 'aria-hidden': true } : {})}
      className="group relative aspect-[3/4] w-[clamp(168px,15vw,220px)] shrink-0 overflow-hidden rounded-[14px]"
      style={{ backgroundColor: GREEN_DEEP }}
    >
      {/*
        Обычный `<img>`, а не `next/image`: адрес фото зависит от того, где
        крутится API, а оптимизатор требует объявить хост заранее. Кадр от
        ВЕРХНЕГО края снимка — корпоративная съёмка портретная, и `cover` от
        середины срезал бы макушку; так же кадрирует приложение.
      */}
      {/* Снимок не открылся — вместо сломанной картинки инициалы на зелёном. */}
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center font-hero text-[40px] font-extrabold"
        style={{ color: `${GOLD_LIGHT}80` }}
      >
        {member.fullName
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part.charAt(0).toUpperCase())
          .join('')}
      </span>
      <img
        src={member.avatarUrl}
        alt={hidden ? '' : member.fullName}
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
        className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-[1200ms] ease-out group-hover:scale-[1.06]"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: 'linear-gradient(180deg, rgb(8 32 26 / 0.05) 40%, rgb(8 32 26 / 0.88) 100%)',
        }}
      />
      <span
        aria-hidden
        className="absolute inset-0 rounded-[14px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ boxShadow: `inset 0 0 0 1px ${GOLD_LIGHT}` }}
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4">
        <span className="text-caption font-semibold leading-tight text-white">{member.fullName}</span>
        <span className="text-footnote leading-snug" style={{ color: GOLD_LIGHT }}>
          {role}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Контакты                                 */
/* -------------------------------------------------------------------------- */

/**
 * Последний экран — один призыв: позвонить.
 *
 * Собран как обложка: кадр из ролика во всю ширину, зелёная дымка слева,
 * текст в её плотной части. Телефон — золотая кнопка, во всю ширину пальца,
 * с номером внутри: главное действие всей страницы не должно выглядеть
 * подписью. Город — надзаголовком: мастерская одна, и она в Ургенче.
 */
function Contact({ copy }: { readonly copy: LandingCopy }): ReactElement {
  const ref = useScrollReveal({ stagger: 100 });
  const telHref = toTelHref(CONTACT_PHONE) ?? `tel:${CONTACT_PHONE}`;

  return (
    <section id="contact" ref={ref} style={{ backgroundColor: GREEN_DEEP }}>
      <div className="relative isolate min-h-[520px] overflow-hidden">
        <img
          src={FILM_STILLS.installed}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(100deg, ${GREEN_DEEP} 0%, ${GREEN} 30%, rgb(15 58 44 / 0.86) 46%, rgb(15 58 44 / 0.35) 64%, transparent 80%),
              linear-gradient(0deg, rgb(8 32 26 / 0.7) 0%, transparent 40%)`,
          }}
        />

        <div className="relative flex min-h-[520px] flex-col justify-center gap-7 px-6 py-20 text-white sm:px-10 lg:px-16">
          <div className="reveal-item">
            <Eyebrow tone="onGreen">{copy.contactCity}</Eyebrow>
          </div>

          <h2 className="reveal-item max-w-[14ch] font-hero text-[clamp(32px,4.6vw,56px)] font-extrabold uppercase leading-[1.0] tracking-[-0.02em]">
            {copy.contactTitle}
          </h2>

          <p className="reveal-item max-w-[34ch] text-body leading-relaxed text-white/70">
            {copy.contactSubtitle}
          </p>

          <div className="reveal-item flex flex-wrap items-center gap-5">
            <a
              href={telHref}
              className="pressable inline-flex items-center gap-3 rounded-full px-9 py-4 font-hero text-[clamp(20px,2.2vw,26px)] font-extrabold tracking-[-0.01em]"
              style={{ backgroundColor: GOLD_LIGHT, color: GREEN_DEEP }}
            >
              {formatPhone(CONTACT_PHONE)}
            </a>
            <span className="text-caption text-white/55">{copy.contactHint}</span>
          </div>

          <p
            aria-hidden
            className="reveal-item pointer-events-none absolute bottom-10 right-6 text-right font-script text-[clamp(24px,3.2vw,42px)] leading-[1.15] sm:right-10 lg:right-16"
            style={{ color: GOLD_LIGHT }}
          >
            Your Style
            <br />
            Our Inspiration
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Подвал                                   */
/* -------------------------------------------------------------------------- */

/**
 * Подвал повторяет шапку: знак, навигация, телефон. Одна золотая нить сверху
 * — та же, что под обложкой.
 */
function SiteFooter({ copy }: { readonly copy: LandingCopy }): ReactElement {
  const telHref = toTelHref(CONTACT_PHONE) ?? `tel:${CONTACT_PHONE}`;

  return (
    <footer className="border-t px-6 py-12" style={{ backgroundColor: GREEN_DEEP, borderColor: `${GOLD}33` }}>
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <span
            aria-hidden
            className="block h-[56px] w-[92px] bg-current"
            style={{
              color: GOLD_LIGHT,
              WebkitMaskImage: 'url(/logo.png)',
              maskImage: 'url(/logo.png)',
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'left',
              maskPosition: 'left',
            }}
          />
          <p className="max-w-[30ch] text-caption leading-relaxed text-white/55">{copy.footerTagline}</p>
        </div>

        <nav aria-label={copy.footerNavLabel} className="flex flex-col gap-2">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="w-fit text-caption text-white/65 transition-colors hover:text-white"
            >
              {copy.nav[link.key]}
            </a>
          ))}
        </nav>

        <div className="flex flex-col gap-2">
          <span className="text-overline uppercase tracking-[0.28em]" style={{ color: GOLD_LIGHT }}>
            {copy.contactCity}
          </span>
          <a href={telHref} className="w-fit font-hero text-[20px] font-extrabold text-white transition-colors hover:text-[#E4C77A]">
            {formatPhone(CONTACT_PHONE)}
          </a>
          <Link
            href="/login"
            className="mt-4 w-fit text-caption text-white/45 underline-offset-4 transition-colors hover:text-white/80 hover:underline"
          >
            {copy.staffLogin}
          </Link>
        </div>
      </div>

      <p className="mx-auto mt-10 max-w-6xl border-t pt-6 text-footnote text-white/35" style={{ borderColor: `${GOLD}1f` }}>
        © {new Date().getFullYear()} Parda Bozor · Design House
      </p>
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
  /**
   * Герой — самый светлый кадр из проверенных: тёплая комната с высокими
   * окнами. Прежний снимок был самым тёмным из восьми (яркость 57 из 255
   * против 104 у этого), и правая половина первого экрана читалась чёрным
   * провалом, а не фотографией.
   */
  hero: '1664112742143-6aa92230d9c6',
  /**
   * По снимку на каждый стиль — подобраны по настроению кадра, а не по
   * порядку: золотые ламбрекены достались классике, белое полотно —
   * минимализму, холодный свет с морем — хай-теку, тёмный бархат — премиуму.
   *
   * Это по-прежнему сток: поиск на unsplash.com недоступен, и выбор идёт из
   * восьми проверенных адресов CDN. Свои снимки работ мастерской заменят их
   * и сразу поднимут страницу выше любого стока — им здесь и место.
   */
  styles: {
    neoClassic: '1601000785676-f9b0ade234d3',
    classic: '1577926606472-fc6d3a33f7e1',
    modern: '1577926382659-d34e9430e853',
    minimal: '1706817969183-908d5b67d465',
    hiTech: '1617617495640-153230cf3408',
    premium: '1659282386282-d7145e593bad',
  },
} as const;

/**
 * Кадры из собственного ролика «Путь заказа» — для разделов «О мастерской»
 * и «Контакты». Это не сток: тот же цех, что листает прокрутка.
 */
const FILM_STILLS = {
  cutting: '/process/frames/f_060.webp',
  installed: '/process/frames/f_282.webp',
} as const;

function unsplash(id: string, width: number): string {
  return `https://images.unsplash.com/photo-${id}?w=${String(width)}&q=80&auto=format&fit=crop`;
}

/**
 * Телефон мастерской — дал владелец для публикации на этой странице.
 *
 * Telegram и Instagram сюда намеренно не добавлены: угадать чужой реальный
 * аккаунт — значит с большой вероятностью привести клиента не туда или на
 * страницу постороннего человека. Добавить эти ссылки — как только появятся
 * настоящие.
 */
const CONTACT_PHONE = '+998932885995';

interface ProcessStep {
  readonly title: string;
  readonly description: string;
}

interface StyleCard {
  readonly name: string;
  readonly caption: string;
  readonly photo: keyof (typeof PHOTOS)['styles'];
}

interface LandingCopy {
  readonly nav: {
    readonly styles: string;
    readonly about: string;
    readonly process: string;
    readonly team: string;
    readonly contact: string;
  };
  readonly staffLogin: string;
  readonly heroWordmarkTagline: string;
  readonly heroTitleLead: string;
  readonly heroTitleAccent: string;
  readonly heroSubtitle: string;
  readonly heroBadges: readonly string[];
  readonly heroCtaPrimary: string;
  readonly heroImageAlt: string;
  readonly stylesEyebrow: string;
  readonly stylesTitle: string;
  readonly styles: readonly StyleCard[];
  readonly statsClientsValue: string;
  readonly statsClientsLabel: string;
  readonly statsFabricsValue: string;
  readonly statsFabricsLabel: string;
  readonly statsYearsValue: string;
  readonly statsYearsLabel: string;
  readonly statsTagline: string;
  readonly aboutEyebrow: string;
  readonly aboutStatement: string;
  readonly aboutParagraph: string;
  readonly aboutImageAlt: string;
  readonly aboutPoints: readonly { readonly title: string; readonly text: string }[];
  readonly processEyebrow: string;
  readonly processTitle: string;
  readonly processSteps: readonly ProcessStep[];
  readonly teamEyebrow: string;
  readonly teamTitle: string;
  readonly teamSubtitle: string;
  readonly contactTitle: string;
  readonly contactSubtitle: string;
  readonly contactCity: string;
  readonly contactHint: string;
  readonly footerTagline: string;
  readonly footerNavLabel: string;
}

const COPY: Record<'ru' | 'uz', LandingCopy> = {
  ru: {
    nav: { styles: 'Стили', about: 'О нас', process: 'Как мы работаем', team: 'Команда', contact: 'Контакты' },
    staffLogin: 'Вход для сотрудников',
    heroWordmarkTagline: 'Curtains & Accessories',
    heroTitleLead: 'Больше, чем просто',
    heroTitleAccent: 'шторы',
    heroSubtitle: 'Создаём уют, стиль и атмосферу в вашем доме.',
    heroBadges: ['Премиальные ткани', 'Индивидуальный пошив', 'Профессиональная установка', 'Комплексные решения'],
    heroCtaPrimary: 'Смотреть стили',
    heroImageAlt: 'Гостиная с золотистыми портьерами и тюлем у панорамного окна',
    stylesEyebrow: 'Каталог',
    stylesTitle: 'Шесть стилей — один почерк мастерской',
    styles: [
      { name: 'Neo Classic', caption: 'Элегантность в каждой детали', photo: 'neoClassic' },
      { name: 'Classic', caption: 'Вечная классика', photo: 'classic' },
      { name: 'Modern', caption: 'Современный стиль жизни', photo: 'modern' },
      { name: 'Minimal', caption: 'Больше пространства', photo: 'minimal' },
      { name: 'Hi-Tech', caption: 'Умные решения для комфорта', photo: 'hiTech' },
      { name: 'Premium', caption: 'Эксклюзивные коллекции', photo: 'premium' },
    ],
    statsClientsValue: '1000+',
    statsClientsLabel: 'Довольных клиентов',
    statsFabricsValue: '50+',
    statsFabricsLabel: 'Коллекций тканей',
    statsYearsValue: '5 лет',
    statsYearsLabel: 'Доверия и качества',
    statsTagline: 'Уют начинается с деталей',
    aboutEyebrow: 'О мастерской',
    aboutStatement: 'Мы не подгоняем шторы под окно — мы шьём их заново, под конкретное окно.',
    aboutParagraph:
      'Design House Parda Bozor шьёт шторы под заказ: от классических портьер до лёгкого тюля. Каждое изделие проходит через одну и ту же мастерскую — замерщика, швею и контролёра, — а не собирается из чужих полуфабрикатов. Это дольше, чем купить готовое, и ровно поэтому держится дольше.',
    aboutImageAlt: 'Раскрой ткани в мастерской Design House',
    aboutPoints: [
      { title: 'Премиальные ткани', text: 'Портьеры, тюль и защита — из коллекций, которые мы сами видели и трогали.' },
      { title: 'Индивидуальный пошив', text: 'Под размер вашего окна: замер, раскрой и пошив в одной мастерской.' },
      { title: 'Профессиональная установка', text: 'Карниз и штору вешают наши установщики — заказ закрыт, когда всё висит как надо.' },
      { title: 'Комплексные решения', text: 'Ткань, карниз, установка и сервис — одним заказом, одной командой.' },
    ],
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
    contactTitle: 'Расскажите о своём окне',
    contactSubtitle: 'Подскажем модель и приедем на замер — обычно в течение нескольких дней.',
    contactCity: 'Ургенч',
    contactHint: 'Звонок или сообщение — ответим и договоримся о замере',
    footerTagline: 'Шторы под заказ: замер, пошив и установка одной мастерской.',
    footerNavLabel: 'Разделы страницы',
  },
  uz: {
    nav: { styles: 'Uslublar', about: 'Biz haqimizda', process: 'Ish jarayoni', team: 'Jamoa', contact: 'Aloqa' },
    staffLogin: 'Xodimlar uchun kirish',
    heroWordmarkTagline: 'Curtains & Accessories',
    heroTitleLead: "Bu shunchaki parda emas —",
    heroTitleAccent: 'bu did',
    heroSubtitle: "Uyingizga qulaylik, uslub va muhit yaratamiz.",
    heroBadges: ['Premium matolar', 'Individual tikuv', "Professional o'rnatish", 'Kompleks yechimlar'],
    heroCtaPrimary: "Uslublarni ko'rish",
    heroImageAlt: "Panoramali deraza oldida tilla rangli pardalar va tyulli mehmonxona",
    stylesEyebrow: 'Katalog',
    stylesTitle: 'Oltita uslub — bitta ustaxona qo\'li',
    styles: [
      { name: 'Neo Classic', caption: 'Har detalda nafislik', photo: 'neoClassic' },
      { name: 'Classic', caption: 'Abadiy klassika', photo: 'classic' },
      { name: 'Modern', caption: 'Zamonaviy turmush tarzi', photo: 'modern' },
      { name: 'Minimal', caption: "Ko'proq bo'shliq", photo: 'minimal' },
      { name: 'Hi-Tech', caption: 'Qulaylik uchun aqlli yechimlar', photo: 'hiTech' },
      { name: 'Premium', caption: 'Eksklyuziv kolleksiyalar', photo: 'premium' },
    ],
    statsClientsValue: '1000+',
    statsClientsLabel: 'Mamnun mijozlar',
    statsFabricsValue: '50+',
    statsFabricsLabel: 'Mato kolleksiyalari',
    statsYearsValue: '5 yil',
    statsYearsLabel: 'Ishonch va sifat',
    statsTagline: "Qulaylik mayda detallardan boshlanadi",
    aboutEyebrow: 'Ustaxona haqida',
    aboutStatement: "Biz pardani derazaga moslamaymiz — uni aynan shu deraza uchun qaytadan tikamiz.",
    aboutParagraph:
      "Design House Parda Bozor pardalarni buyurtma asosida tikadi: klassik pardalardan yengil tyulgacha. Har bir buyurtma bitta ustaxonadan — o'lchovchi, tikuvchi va nazoratchidan — o'tadi, boshqa joydan tayyor qismlar yig'ilmaydi. Bu tayyorini sotib olishdan sekinroq, va aynan shu sababli uzoqroq xizmat qiladi.",
    aboutImageAlt: "Design House ustaxonasida mato bichish",
    aboutPoints: [
      { title: 'Premium matolar', text: "Pardalar, tyul va himoya — o'zimiz ko'rgan va ushlab ko'rgan kolleksiyalardan." },
      { title: 'Individual tikuv', text: "Derazangiz o'lchamiga: o'lchov, bichish va tikuv bitta ustaxonada." },
      { title: "Professional o'rnatish", text: "Karniz va pardani o'rnatuvchilarimiz osadi — hammasi kerakli joyda turganda buyurtma yopiladi." },
      { title: 'Kompleks yechimlar', text: "Mato, karniz, o'rnatish va xizmat — bitta buyurtma, bitta jamoa." },
    ],
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
    contactTitle: 'Derazangiz haqida gapirib bering',
    contactSubtitle: "Model tavsiya qilamiz va o'lchovga kelamiz — odatda bir necha kun ichida.",
    contactCity: 'Urganch',
    contactHint: "Qo'ng'iroq yoki xabar — javob beramiz va o'lchovga kelishamiz",
    footerTagline: "Buyurtma asosida pardalar: o'lchov, tikuv va o'rnatish bitta ustaxonada.",
    footerNavLabel: "Sahifa bo'limlari",
  },
};
