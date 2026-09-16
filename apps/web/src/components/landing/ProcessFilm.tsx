'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';

/**
 * Путь заказа — одним кадром, который листает прокрутка.
 *
 * Как у Apple: сначала ролик проигрывается сам, один раз, пока зритель
 * смотрит; дальше тот же ролик разложен по кадрам, и прокрутка ведёт его
 * вперёд-назад — замер, раскрой, пошив, контроль, установка. Кадры
 * рисуются на `canvas` из заранее нарезанной последовательности: тянуть
 * `video.currentTime` на скролле дёргается и не даёт покадровой точности,
 * а последовательность webp листается ровно.
 *
 * Подписи этапов живут в своих отрезках прокрутки — пять отрезков на пять
 * этапов, как в самом ролике: он снят одним движением слева направо через
 * те же пять моментов.
 *
 * Ролик сгенерирован в Higgsfield (Kling 3.0) по сценарию цеха: 10 секунд
 * мастерской (замер, раскрой, пошив, контроль) и 5 секунд установки,
 * склеены через затемнение; кадры — `ffmpeg`, 20 к/с: при 8 к/с соседние
 * кадры отличались слишком сильно, и листание дёргалось. Файлы лежат в
 * `public/process/`.
 */

export interface FilmStep {
  readonly title: string;
  readonly description: string;
}

const FRAME_COUNT = 288;
const FRAME_URL = (index: number): string => `/process/frames/f_${index.toString().padStart(3, '0')}.webp`;
const VIDEO_URL = '/process/process.mp4';
const POSTER_URL = FRAME_URL(1);
/**
 * Высота прокрутки в экранах: чем больше, тем медленнее листается ролик.
 * Пять экранов владелец назвал «очень коротко» — ролик пролетал за два
 * движения колёсика; десять — как у Apple, этап на пару экранов.
 */
const SCROLL_SCREENS = 10;
/**
 * Доля пути до цели за кадр: показанный прогресс догоняет прокрутку не
 * рывком, а плавно, — иначе быстрый жест колёсика перескакивал по десять
 * кадров, и движение рвалось.
 */
const EASE = 0.12;
/**
 * Границы этапов в долях ролика — по тому, где что снято: первые четыре
 * момента занимают 9,4 с из 14,4, установка — остальное.
 */
const STEP_BOUNDS = [0, 0.163, 0.326, 0.49, 0.653, 1] as const;

export function ProcessFilm({
  steps,
  eyebrow,
  title,
}: {
  readonly steps: readonly FilmStep[];
  readonly eyebrow: string;
  readonly title: string;
}): ReactElement {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const framesRef = useRef<(HTMLImageElement | null)[]>([]);
  const [phase, setPhase] = useState<'video' | 'frames'>('video');
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);

  /* Настройка «уменьшить движение»: ролик не листаем, показываем кадр и список. */
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);
    const onChange = (event: MediaQueryListEvent): void => {
      setReduced(event.matches);
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);

  /* Кадры подгружаются заранее, когда раздел на подходе, — иначе первый
     же скролл показал бы пустой холст. */
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (wrapper === null || reduced) return;
    let started = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || started) return;
        started = true;
        for (let index = 1; index <= FRAME_COUNT; index += 1) {
          const image = new Image();
          image.decoding = 'async';
          image.src = FRAME_URL(index);
          framesRef.current[index] = image;
        }
        observer.disconnect();
      },
      { rootMargin: '100% 0px' },
    );
    observer.observe(wrapper);
    return () => {
      observer.disconnect();
    };
  }, [reduced]);

  /* Фаза 1: ролик стартует, когда экран с ним показался хотя бы наполовину.
     Наблюдаем за липким экраном, а не за обёрткой в пять экранов: у той
     видимая доля никогда не дошла бы до половины, и ролик не стартовал бы. */
  useEffect(() => {
    const sticky = stickyRef.current;
    const video = videoRef.current;
    if (sticky === null || video === null || reduced) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void video.play().catch(() => undefined);
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(sticky);
    return () => {
      observer.disconnect();
    };
  }, [reduced]);

  /*
    Фаза 2: прокрутка ведёт кадры. Ролик уступает место кадрам, как только
    зритель повёл страницу дальше, либо когда сам доиграл до конца.

    Цель — положение прокрутки; показанный прогресс догоняет её в цикле
    `requestAnimationFrame` с затуханием. Кадр рисуется прямо из цикла,
    без React-состояния: состояние здесь только для подписей и шкалы, и
    обновляется, когда меняется видимая цифра.
  */
  const targetRef = useRef(0);
  const shownRef = useRef(0);
  const drawnRef = useRef(0);
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (wrapper === null || canvas === null || reduced) return;
    let raf = 0;
    let running = true;

    const draw = (index: number): void => {
      const image = framesRef.current[index];
      if (image === null || image === undefined || !image.complete || image.naturalWidth === 0) return;
      const context = canvas.getContext('2d');
      if (context === null) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      context.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
      drawnRef.current = index;
    };

    const measure = (): void => {
      const rect = wrapper.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      targetRef.current = total <= 0 ? 0 : Math.min(1, Math.max(0, -rect.top / total));
      if (targetRef.current > 0.02) setPhase('frames');
    };

    const tick = (): void => {
      if (!running) return;
      const target = targetRef.current;
      const shown = shownRef.current;
      const next = Math.abs(target - shown) < 0.0005 ? target : shown + (target - shown) * EASE;
      if (next !== shown) {
        shownRef.current = next;
        setProgress(next);
      }
      const index = Math.min(FRAME_COUNT, Math.max(1, Math.round(next * (FRAME_COUNT - 1)) + 1));
      if (index !== drawnRef.current || canvas.width === 0) draw(index);
      raf = window.requestAnimationFrame(tick);
    };

    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    raf = window.requestAnimationFrame(tick);
    return () => {
      running = false;
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      window.cancelAnimationFrame(raf);
    };
  }, [reduced]);

  const activeStep = Math.max(
    0,
    Math.min(steps.length - 1, STEP_BOUNDS.findIndex((bound, index) => progress < (STEP_BOUNDS[index + 1] ?? 2) && progress >= bound)),
  );

  if (reduced) {
    return (
      <div className="relative overflow-hidden">
        <img src={POSTER_URL} alt="" className="h-[60vh] w-full object-cover" />
      </div>
    );
  }

  return (
    <div ref={wrapperRef} style={{ height: `${SCROLL_SCREENS * 100}vh` }}>
      <div ref={stickyRef} className="sticky top-0 h-screen overflow-hidden bg-black">
        <video
          ref={videoRef}
          src={VIDEO_URL}
          poster={POSTER_URL}
          muted
          playsInline
          preload="auto"
          onEnded={() => {
            setPhase('frames');
          }}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: phase === 'video' ? 1 : 0, transition: 'opacity 300ms' }}
        />
        <canvas
          ref={canvasRef}
          aria-hidden
          className="absolute inset-0 h-full w-full"
          style={{ opacity: phase === 'frames' ? 1 : 0, transition: 'opacity 300ms' }}
        />

        {/* Тёмная дымка снизу — под подписью; кадр остаётся кадром. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(0deg, rgb(8 32 26 / 0.82) 0%, rgb(8 32 26 / 0.35) 32%, transparent 60%)',
          }}
        />

        <div className="absolute left-6 top-24 flex flex-col gap-3 sm:left-10 lg:left-16 lg:top-28">
          <span className="text-overline uppercase tracking-[0.42em] text-white/55">{eyebrow}</span>
          <h2 className="max-w-[16ch] font-hero text-[clamp(24px,3vw,36px)] font-extrabold uppercase leading-[1.05] tracking-[-0.02em] text-white">
            {title}
          </h2>
        </div>

        {/* Подписи этапов: одна активная, остальные — прозрачные на том же месте. */}
        <div className="absolute bottom-10 left-6 right-6 sm:left-10 lg:bottom-16 lg:left-16">
          <div className="relative min-h-[120px]">
            {steps.map((step, index) => (
              <div
                key={step.title}
                className="absolute inset-x-0 bottom-0 flex flex-col gap-2"
                style={{
                  opacity: index === activeStep ? 1 : 0,
                  transform: index === activeStep ? 'translateY(0)' : 'translateY(12px)',
                  transition: 'opacity 350ms ease, transform 350ms ease',
                }}
                aria-hidden={index !== activeStep}
              >
                <span className="font-mono text-overline tracking-[0.3em] text-[#E4C77A]">
                  {`0${(index + 1).toString()} / 0${steps.length.toString()}`}
                </span>
                <h3 className="font-hero text-[clamp(28px,4vw,52px)] font-extrabold uppercase leading-none tracking-[-0.02em] text-white">
                  {step.title}
                </h3>
                <p className="max-w-[44ch] text-caption leading-relaxed text-white/75 sm:text-body">{step.description}</p>
              </div>
            ))}
          </div>

          {/* Шкала: пять засечек, заполняется прокруткой. */}
          <div className="mt-6 flex gap-2">
            {steps.map((step, index) => (
              <span
                key={step.title}
                aria-hidden
                className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/20"
              >
                <span
                  className="block h-full rounded-full bg-[#E4C77A]"
                  style={{
                    width: `${(
                      Math.min(
                        1,
                        Math.max(
                          0,
                          (progress - (STEP_BOUNDS[index] ?? 0)) /
                            ((STEP_BOUNDS[index + 1] ?? 1) - (STEP_BOUNDS[index] ?? 0)),
                        ),
                      ) * 100
                    ).toString()}%`,
                  }}
                />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
