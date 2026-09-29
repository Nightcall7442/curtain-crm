'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import { GOLD, GOLD_LIGHT } from './theme';

/**
 * Карусель лендинга: сама едет, а руками листается как обычная лента.
 *
 * Раньше лента была чистой анимацией — картинкой, уезжающей влево. Смотреть
 * её можно было только глазами: смахнуть, потянуть мышью, щёлкнуть стрелку
 * было нечем, а раздел «Команда» из девятнадцати человек показывал четверых
 * и стоял: анимация заводилась один раз на пустой странице, до прихода
 * списка сотрудников, и больше не пробовала. Здесь лента — настоящий
 * горизонтальный скролл, и всё остальное надстроено над ним:
 *
 *  - палец, трекпад и колесо листают её сами, без единой строки кода;
 *  - мышью ленту тянут, а щелчок по карточке после перетаскивания гасится;
 *  - стрелки (со средней ширины экрана) листают на карточку-две;
 *  - сама она ползёт с постоянной скоростью и уступает, как только с ней
 *    что-то делают: наведённая мышь, клавиатурный фокус, касание, колесо,
 *    стрелка — а через несколько секунд покоя едет дальше;
 *  - «уменьшить движение» в системе — никакой самоходки, остальное на месте.
 *
 * Бесконечность — копиями: лента состоит из нескольких одинаковых проходов, и
 * когда её уносит из среднего, положение бесшовно переставляется на такое же
 * место среднего. Копий столько, чтобы средний проход всегда был заполнен
 * с обеих сторон, даже на очень широком мониторе.
 */

/** Сколько ждать после касания, колеса или стрелки, прежде чем лента поедет сама. */
const IDLE_MS = 3000;
/** Сколько копий нужно как минимум: слева от среднего, он сам и справа. */
const MIN_COPIES = 3;
/** Записанное нами положение и прочитанное обратно могут отличаться на округление. */
const OWN_SCROLL_TOLERANCE = 2;
/** Мышью протащили дальше — это перетаскивание, а не щелчок по карточке. */
const DRAG_THRESHOLD = 6;
/** Затухание карточек у краёв ленты — она не обрывается по линейке. */
const EDGE_MASK =
  'linear-gradient(90deg, transparent 0, #000 40px, #000 calc(100% - 40px), transparent 100%)';

/** Только средний проход читают вспомогательные технологии — остальные лишь повторяют его. */
const CANONICAL_PASS = 1;

interface DragState {
  active: boolean;
  moved: boolean;
  startX: number;
  startScroll: number;
}

export function Carousel<T>({
  items,
  keyOf,
  renderItem,
  label,
  prevLabel,
  nextLabel,
  speed = 22,
  keyboardScrollable = true,
}: {
  readonly items: readonly T[];
  readonly keyOf: (item: T) => string;
  /** `hidden` — карточка из повторного прохода: не читается и не берёт фокус. */
  readonly renderItem: (item: T, context: { readonly hidden: boolean }) => ReactNode;
  readonly label: string;
  readonly prevLabel: string;
  readonly nextLabel: string;
  /** Скорость самоходки, пикселей в секунду. */
  readonly speed?: number;
  /** У ленты без фокусируемых карточек клавиатура листает сама лента. */
  readonly keyboardScrollable?: boolean;
}): ReactElement | null {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [copies, setCopies] = useState(MIN_COPIES);
  const periodRef = useRef(0);
  const holdRef = useRef<(ms: number) => void>(() => undefined);
  const reducedRef = useRef(false);
  const flags = useRef({ hovering: false, keyboardFocus: false, visible: true });
  const drag = useRef<DragState>({ active: false, moved: false, startX: 0, startScroll: 0 });
  const count = items.length;

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null || count === 0) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = reduced.matches;
    const onReducedChange = (event: MediaQueryListEvent): void => {
      reducedRef.current = event.matches;
    };
    reduced.addEventListener('change', onReducedChange);

    let frame = 0;
    let last = performance.now();
    /** Положение при самоходке — дробное: `scrollLeft` округляется, а шаг за кадр меньше пикселя. */
    let position = scroller.scrollLeft;
    /** Что прочитали обратно сразу после своей записи — по нему отличаем своё движение от чужого. */
    let expected = position;
    let heldUntil = 0;
    let settleTimer = 0;

    const hold = (ms: number): void => {
      heldUntil = Math.max(heldUntil, performance.now() + ms);
    };
    holdRef.current = hold;

    /** Длина одного прохода — расстояние между началами первой и второй копий. */
    const measure = (): number => {
      const first = scroller.querySelector<HTMLElement>('[data-pass="0"]');
      const second = scroller.querySelector<HTMLElement>('[data-pass="1"]');
      return first === null || second === null ? 0 : second.offsetLeft - first.offsetLeft;
    };

    /** Возвращает ленту в средний проход: соседние копии одинаковы, шва не видно. */
    const wrap = (): void => {
      const period = periodRef.current;
      if (period < 1) return;
      const x = scroller.scrollLeft;
      if (x < period) scroller.scrollLeft = x + period;
      else if (x >= 2 * period) scroller.scrollLeft = x - period;
      else return;
      position = scroller.scrollLeft;
      expected = position;
    };

    const remeasure = (): void => {
      const previous = periodRef.current;
      const period = measure();
      if (period < 1) return;
      periodRef.current = period;

      // Копий столько, чтобы за средним проходом с обеих сторон хватало ленты.
      const needed = Math.ceil(scroller.clientWidth / period) + 2;
      setCopies((current) => (needed > current ? needed : current));

      if (previous < 1) {
        // Первое измерение: встаём в начало среднего прохода.
        scroller.scrollLeft = period;
      } else if (Math.abs(previous - period) > 1) {
        // Карточки стали другой ширины (поворот телефона, окно): держим то же место в проходе.
        const fraction = (scroller.scrollLeft % previous) / previous;
        scroller.scrollLeft = period + fraction * period;
      }
      position = scroller.scrollLeft;
      expected = position;
    };

    const onScroll = (): void => {
      if (Math.abs(scroller.scrollLeft - expected) <= OWN_SCROLL_TOLERANCE) return;
      // Двигали не мы — палец, колесо, стрелка, клавиша: запоминаем, где остановились.
      position = scroller.scrollLeft;
      expected = position;
      hold(IDLE_MS);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(wrap, 150);
    };

    const tick = (now: number): void => {
      frame = window.requestAnimationFrame(tick);
      const dt = Math.min(64, now - last);
      last = now;

      const { hovering, keyboardFocus, visible } = flags.current;
      if (
        reducedRef.current ||
        hovering ||
        keyboardFocus ||
        drag.current.active ||
        !visible ||
        now < heldUntil ||
        periodRef.current < 1
      ) {
        return;
      }

      position += (speed * dt) / 1000;
      if (position >= 2 * periodRef.current) position -= periodRef.current;
      scroller.scrollLeft = position;
      expected = scroller.scrollLeft;
    };

    // Перетаскивание мышью — на окне: курсор уходит с ленты, а тянуть продолжают.
    const onPointerMove = (event: globalThis.PointerEvent): void => {
      const state = drag.current;
      if (!state.active) return;
      const dx = event.clientX - state.startX;
      if (Math.abs(dx) > DRAG_THRESHOLD) state.moved = true;
      if (state.moved) scroller.scrollLeft = state.startScroll - dx;
    };
    const onPointerUp = (): void => {
      if (!drag.current.active) return;
      drag.current.active = false;
      hold(IDLE_MS);
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(wrap, 150);
    };

    const onTouch = (): void => {
      hold(IDLE_MS);
    };

    const visibility = new IntersectionObserver(
      (entries) => {
        flags.current.visible = entries.some((entry) => entry.isIntersecting);
      },
      { threshold: 0 },
    );
    visibility.observe(scroller);

    const resize = new ResizeObserver(remeasure);
    resize.observe(scroller);
    const firstItem = scroller.querySelector('[data-pass="0"]');
    if (firstItem !== null) resize.observe(firstItem);
    remeasure();

    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('wheel', onTouch, { passive: true });
    scroller.addEventListener('touchstart', onTouch, { passive: true });
    scroller.addEventListener('touchend', onTouch, { passive: true });
    scroller.addEventListener('keydown', onTouch);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      visibility.disconnect();
      resize.disconnect();
      reduced.removeEventListener('change', onReducedChange);
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('wheel', onTouch);
      scroller.removeEventListener('touchstart', onTouch);
      scroller.removeEventListener('touchend', onTouch);
      scroller.removeEventListener('keydown', onTouch);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
    // Число копий меняет только длину ленты, а не сами карточки — эффект не перезапускаем.
  }, [count, speed]);

  if (count === 0) return null;

  const step = (direction: 1 | -1): void => {
    const scroller = scrollerRef.current;
    const card = scroller?.querySelector<HTMLElement>('[data-pass="0"]');
    if (scroller === null || scroller === undefined || card === null || card === undefined) return;
    holdRef.current(IDLE_MS + 1500);
    // Целое число карточек, минус одна: следующий кадр начинается там, где кончился этот.
    const visibleCards = Math.max(2, Math.floor(scroller.clientWidth / card.offsetWidth));
    scroller.scrollBy({
      left: direction * card.offsetWidth * (visibleCards - 1),
      behavior: reducedRef.current ? 'auto' : 'smooth',
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    // Палец и перо листают сами; перетаскивание — только для мыши.
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startScroll: event.currentTarget.scrollLeft,
    };
  };

  const onFocus = (event: FocusEvent<HTMLDivElement>): void => {
    // Только клавиатурный фокус: щелчок по стрелке фокус тоже даёт, и лента вставала бы навсегда.
    if (event.target.matches(':focus-visible')) flags.current.keyboardFocus = true;
  };

  const arrow =
    'absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border backdrop-blur-sm transition-colors md:flex';
  const arrowStyle = {
    borderColor: `${GOLD}99`,
    backgroundColor: 'rgb(8 32 26 / 0.72)',
    color: GOLD_LIGHT,
  } as const;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      className="group/carousel relative"
      onMouseEnter={() => {
        flags.current.hovering = true;
      }}
      onMouseLeave={() => {
        flags.current.hovering = false;
      }}
      onFocus={onFocus}
      onBlur={() => {
        flags.current.keyboardFocus = false;
      }}
    >
      <div
        ref={scrollerRef}
        {...(keyboardScrollable ? { tabIndex: 0, 'aria-label': label } : {})}
        className="relative flex cursor-grab select-none overflow-x-auto overscroll-x-contain outline-offset-4 [scrollbar-width:none] active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E4C77A] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: EDGE_MASK, WebkitMaskImage: EDGE_MASK }}
        onPointerDown={onPointerDown}
        onClickCapture={(event) => {
          // После перетаскивания щелчок по карточке — не намерение открыть её.
          if (drag.current.moved) {
            event.preventDefault();
            event.stopPropagation();
            drag.current.moved = false;
          }
        }}
        onDragStart={(event) => {
          event.preventDefault();
        }}
      >
        {Array.from({ length: copies }, (_unused, pass) =>
          items.map((item) => {
            const hidden = pass !== CANONICAL_PASS;
            return (
              <div
                key={`${pass.toString()}-${keyOf(item)}`}
                data-pass={pass}
                className="shrink-0 pr-4"
                {...(hidden ? { 'aria-hidden': true } : {})}
              >
                {renderItem(item, { hidden })}
              </div>
            );
          }),
        )}
      </div>

      <button
        type="button"
        aria-label={prevLabel}
        onClick={() => {
          step(-1);
        }}
        className={`${arrow} left-3 hover:!bg-[#E4C77A] hover:!text-[#08201A]`}
        style={arrowStyle}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={nextLabel}
        onClick={() => {
          step(1);
        }}
        className={`${arrow} right-3 hover:!bg-[#E4C77A] hover:!text-[#08201A]`}
        style={arrowStyle}
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
