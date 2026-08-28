import type { ReactElement } from 'react';
import { Construction } from 'lucide-react';

/**
 * Страница раздела, который ещё не реализован.
 *
 * Показывает честное «раздела пока нет» и перечисляет, чего именно не хватает
 * в системе. Альтернатива — нарисовать макет с выдуманными числами — хуже:
 * такой экран невозможно отличить от рабочего, и по нему начинают принимать
 * решения.
 */
export function StubPage({
  title,
  reason,
  requires,
}: {
  readonly title: string;
  readonly reason: string;
  readonly requires?: readonly string[];
}): ReactElement {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <section className="max-w-lg rounded-panel border border-subtle bg-panel p-8 text-center shadow-panel">
        <span
          aria-hidden
          className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-gold-dim/50 text-gold-dim"
        >
          <Construction className="h-5 w-5" />
        </span>

        <h2 className="mt-4 text-[15px] font-semibold text-primary">{title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-secondary">{reason}</p>

        {requires !== undefined && requires.length > 0 && (
          <>
            <p className="mt-5 text-[11px] uppercase tracking-[0.12em] text-muted">
              Чтобы раздел заработал, нужны
            </p>
            <ul className="mt-2 space-y-1 text-left text-[12.5px] text-secondary">
              {requires.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="text-gold-dim">
                    •
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
