'use client';

import { DEPARTMENT_LABELS, formatPhone, toTelHref, type Department } from '@curtain-crm/shared';
import { animate, stagger, utils } from 'animejs';
import { ArrowRight } from 'lucide-react';
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
      <div className="grid overflow-hidden lg:grid-cols-[minmax(0,560px)_1fr]">
        {/* Левая панель. Градиент, а не заливка: у референса свет падает
            сверху слева, и ровный прямоугольник рядом с фотографией
            выглядит наклейкой. */}
        <div
          className="relative flex flex-col justify-center gap-9 px-8 py-14 text-white sm:px-12 lg:px-14 lg:py-24"
          style={{
            backgroundImage: `radial-gradient(120% 90% at 12% 0%, #1A5540 0%, ${GREEN} 45%, ${GREEN_DEEP} 100%)`,
          }}
        >
          <a
            href="#top"
            className="hero-enter flex flex-col items-start gap-3"
            style={{ animationDelay: heroDelay(0) }}
          >
            <span
              aria-hidden
              className="block h-[76px] w-[122px] bg-current"
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
            {/* Название «Design House» впечатано в сам знак — вторая подпись
                тем же текстом рядом читалась бы как повтор. Здесь только то,
                чего в файле нет: тег ассортимента. */}
            <span className="text-overline uppercase tracking-[0.42em] text-white/55">
              {copy.heroWordmarkTagline}
            </span>
          </a>

          <div className="hero-enter flex flex-col gap-5" style={{ animationDelay: heroDelay(1) }}>
            <h1 className="font-hero text-[clamp(36px,5.4vw,60px)] font-extrabold uppercase leading-[0.98] tracking-[-0.02em]">
              {copy.heroTitleLead}
              <br />
              <span style={{ color: GOLD_LIGHT }}>{copy.heroTitleAccent}</span>
            </h1>
            <p className="max-w-[24rem] text-body leading-relaxed text-white/70">
              {copy.heroSubtitle}
            </p>
          </div>

          {/* Два столбца, а не четыре в ряд, как в референсе: там подписи
              короткие, а «Профессиональная установка» на четверти панели
              переносится в три строки и слипается с соседней. Ширина
              панели — величина заданная, длина слов — тоже; уступает
              сетка. */}
          <ul
            className="hero-enter grid grid-cols-2 gap-x-8 gap-y-6"
            style={{ animationDelay: heroDelay(2) }}
          >
            {copy.heroBadges.map((badge) => (
              <li key={badge} className="flex flex-col items-start gap-3">
                {/* Золотой волосок вместо значка.

                    Здесь стояли иконки из общего набора — бриллиант,
                    искорки, домик. На витрине мастерской премиального
                    сегмента они читались наклейками из мессенджера: набор
                    один и тот же у любого сайта, и ни одна из четырёх не
                    говорила о шторах ничего, чего не сказала бы подпись под
                    ней. Осталась подпись и та же линия, которой набраны
                    надзаголовки разделов и линия процесса. */}
                <span aria-hidden className="h-px w-7" style={{ backgroundColor: GOLD }} />
                <span className="text-caption leading-snug text-white/80">{badge}</span>
              </li>
            ))}
          </ul>

          <a
            href="#styles"
            className="hero-enter pressable inline-flex w-fit items-center gap-3 rounded-full px-7 py-3.5 text-caption font-bold uppercase tracking-[0.12em]"
            style={{
              animationDelay: heroDelay(3),
              backgroundColor: GOLD_LIGHT,
              color: GREEN_DEEP,
            }}
          >
            {copy.heroCtaPrimary}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>

        {/* Фотография во всю высоту. Слева — растушёвка в зелень панели,
            чтобы стык двух половин не выглядел склейкой двух картинок. */}
        <div className="hero-kenburns relative min-h-[340px] lg:min-h-[660px]">
          <Image
            src={unsplash(PHOTOS.hero, 1600)}
            alt={copy.heroImageAlt}
            fill
            priority
            sizes="(min-width: 1024px) 62vw, 100vw"
            className="object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(90deg, ${GREEN_DEEP} 0%, transparent 22%),
                linear-gradient(0deg, rgb(8 32 26 / 0.55) 0%, transparent 38%)`,
            }}
          />

          {/* Росчерк — та самая деталь референса, которая делает кадр
              фирменным, а не стоковым. Латиница в обеих локалях: это
              подпись, а не текст интерфейса. */}
          <p
            aria-hidden
            className="hero-enter absolute bottom-10 right-8 text-right font-script text-[clamp(26px,3.4vw,44px)] leading-[1.15] sm:right-12"
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
function StyleStrip({ copy }: { readonly copy: LandingCopy }): ReactElement {
  const trackRef = useRef<HTMLDivElement | null>(null);
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
  }, []);

  const hold = (): void => {
    driftRef.current?.pause();
  };
  const release = (): void => {
    driftRef.current?.play();
  };

  return (
    <section
      id="styles"
      aria-label={copy.stylesTitle}
      className="overflow-hidden border-y"
      style={{ borderColor: `${GOLD}22` }}
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocus={hold}
      onBlur={release}
    >
      <h2 className="sr-only">{copy.stylesTitle}</h2>

      <div ref={trackRef} className="flex w-max">
        {[0, 1].map((pass) =>
          copy.styles.map((style) => (
            <a
              key={`${pass.toString()}-${style.name}`}
              href="#contact"
              /* Второй проход — копия первого, для читалки это повтор одного
                 и того же: озвучивать его незачем. */
              {...(pass === 1 ? { 'aria-hidden': true, tabIndex: -1 } : {})}
              className="group relative block aspect-[4/3] w-[clamp(190px,20vw,280px)] shrink-0 overflow-hidden"
            >
              <Image
                src={unsplash(PHOTOS.styles[style.photo], 560)}
                alt=""
                fill
                sizes="280px"
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
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
                style={{ backgroundColor: GOLD_LIGHT }}
              />
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4">
                <span
                  className="text-caption font-bold uppercase tracking-[0.1em]"
                  style={{ color: GOLD_LIGHT }}
                >
                  {style.name}
                </span>
                <span className="text-footnote leading-snug text-white/70">{style.caption}</span>
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
 * Разворот-заявление. Без фотографии.
 *
 * Здесь стоял стоковый снимок ниток и ножниц — единственный кадр на
 * странице, который не про шторы, а про швейный набор из фотобанка: рядом
 * с обложкой он читался как чужой. Заменить его нечем — все проверенные
 * снимки уже заняты витриной стилей этажом выше, и повтор через экран
 * выглядел бы затычкой. Раздел стал типографским: короткое заявление
 * засечным — оно и есть то, что владелец говорит клиенту первым.
 */
function About({ copy }: { readonly copy: LandingCopy }): ReactElement {
  const ref = useScrollReveal({ stagger: 120 });

  return (
    <section id="about" ref={ref} className="px-6 py-24" style={{ backgroundColor: CREAM }}>
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
        <div className="reveal-item">
          <Eyebrow tone="onCream">{copy.aboutEyebrow}</Eyebrow>
        </div>

        <div className="reveal-item flex flex-col gap-8">
          <p
            className="font-editorial text-[clamp(28px,3.6vw,44px)] leading-[1.18] tracking-[-0.015em]"
            style={{ color: GREEN_DEEP }}
          >
            {copy.aboutStatement}
          </p>

          <span aria-hidden className="h-px w-24" style={{ backgroundColor: `${GOLD}66` }} />

          <p
            className="max-w-2xl text-body leading-[1.75]"
            style={{ color: 'rgb(31 45 39 / 0.72)' }}
          >
            {copy.aboutParagraph}
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
    <section id="process" ref={ref} className="px-6 py-24" style={{ backgroundColor: GREEN }}>
      <div className="mx-auto max-w-6xl">
        <div className="reveal-item mb-16 flex flex-col gap-4">
          <Eyebrow tone="onGreen">{copy.processEyebrow}</Eyebrow>
          <h2 className="font-hero text-[clamp(28px,3.4vw,40px)] font-extrabold uppercase leading-[1.05] tracking-[-0.02em] text-white">
            {copy.processTitle}
          </h2>
        </div>

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
  const ref = useScrollReveal({ stagger: 60, ease: 'outBack', ready: team.data !== undefined });

  // Пока грузится или пусто — молчим. У совсем новой мастерской без единой
  // загруженной фотографии сотрудника раздел просто не появится: пустая
  // витрина с подписью «наша команда» смотрелась бы хуже, чем её отсутствие.
  if (team.isLoading) {
    return (
      <section id="team" className="px-6 py-24" style={{ backgroundColor: CREAM }}>
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
    <section
      id="team"
      ref={ref}
      className="px-6 py-24"
      style={{ backgroundColor: CREAM }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="reveal-item mb-16 flex flex-col items-center gap-4 text-center">
          <Eyebrow tone="onCream">{copy.teamEyebrow}</Eyebrow>
          <h2
            className="font-editorial text-[clamp(28px,3.4vw,40px)] leading-tight"
            style={{ color: GREEN_DEEP }}
          >
            {copy.teamTitle}
          </h2>
          <p className="max-w-xl text-body" style={{ color: 'rgb(31 45 39 / 0.65)' }}>
            {copy.teamSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-x-6 gap-y-12 sm:gap-x-10">
          {team.data.map((member, index) => (
            <TeamCard key={member.id} member={member} locale={locale} index={index} />
          ))}
        </div>
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
        className="relative overflow-hidden rounded-full"
        style={{
          width: rhythm.size,
          height: rhythm.size,
          boxShadow: `0 0 0 2px ${CREAM}, 0 0 0 3px ${GOLD}55`,
        }}
      >
        <img
          src={member.avatarUrl}
          alt={member.fullName}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
      <div className="text-center">
        <p className="text-caption font-semibold leading-tight" style={{ color: GREEN_DEEP }}>
          {member.fullName}
        </p>
        <p className="text-footnote" style={{ color: 'rgb(31 45 39 / 0.55)' }}>
          {role}
        </p>
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
 * Телефон был набран засечным в тёмной коробке и ничем не отличался от
 * заголовка: главное действие всей страницы выглядело подписью. Теперь это
 * кнопка — золотая, во всю ширину пальца, с номером внутри. Номер остаётся
 * и текстом рядом: его переписывают в записную книжку, а из кнопки текст
 * выделять неудобно.
 */
function Contact({ copy }: { readonly copy: LandingCopy }): ReactElement {
  const ref = useScrollReveal({ stagger: 100 });
  const telHref = toTelHref(CONTACT_PHONE) ?? `tel:${CONTACT_PHONE}`;

  return (
    <section
      id="contact"
      ref={ref}
      className="px-6 py-28"
      style={{ backgroundColor: GREEN_DEEP }}
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 text-center">
        <div className="reveal-item">
          <Eyebrow tone="onGreen">{copy.contactCity}</Eyebrow>
        </div>

        <h2 className="reveal-item font-hero text-[clamp(30px,4.4vw,52px)] font-extrabold uppercase leading-[1.03] tracking-[-0.02em] text-white">
          {copy.contactTitle}
        </h2>

        <p className="reveal-item max-w-xl text-body leading-relaxed text-white/65">
          {copy.contactSubtitle}
        </p>

        <a
          href={telHref}
          className="reveal-item pressable inline-flex items-center gap-3 rounded-full px-9 py-4 font-hero text-[clamp(20px,2.4vw,26px)] font-extrabold tracking-[-0.01em]"
          style={{ backgroundColor: GOLD_LIGHT, color: GREEN_DEEP }}
        >
          {formatPhone(CONTACT_PHONE)}
        </a>


      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Подвал                                   */
/* -------------------------------------------------------------------------- */

function SiteFooter({ copy }: { readonly copy: LandingCopy }): ReactElement {
  return (
    <footer
      className="border-t px-6 py-8"
      style={{ backgroundColor: GREEN_DEEP, borderColor: `${GOLD}26` }}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="text-caption text-white/45">
          © {new Date().getFullYear()} Parda Bozor · Design House
        </p>
        <Link
          href="/login"
          className="text-caption text-white/45 underline-offset-4 transition-colors hover:text-white/80 hover:underline"
        >
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
  readonly processEyebrow: string;
  readonly processTitle: string;
  readonly processSteps: readonly ProcessStep[];
  readonly teamEyebrow: string;
  readonly teamTitle: string;
  readonly teamSubtitle: string;
  readonly contactTitle: string;
  readonly contactSubtitle: string;
  readonly contactCity: string;
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
  },
};
