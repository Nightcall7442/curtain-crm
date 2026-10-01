/**
 * Ответ, который клиент tRPC не разберёт, — превращается в понятную ошибку.
 *
 * Отдельный файл без обращений к хранилищу и сети телефона: логика проверяется
 * в обычном Node настоящим клиентом tRPC.
 */

/** Сколько процедур в пакетном запросе: `/trpc/a,b,c?batch=1` — три, и ответ должен быть из трёх. */
export function batchSize(input: RequestInfo | URL): number {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = /\/trpc\/([^?]+)/.exec(url)?.[1] ?? '';
  return Math.max(1, path.split(',').length);
}

/**
 * Ошибка в формате, который клиент tRPC читает как обычный отказ процедуры.
 *
 * Когда между приложением и API что-то отвечает не-JSON — обрыв на прокси,
 * перезапуск сервера, ограничитель, — клиент tRPC вызывает `response.json()`
 * и сотрудник видит «JSON Parse error: Unexpected character: u»: это сообщение
 * ничего не говорит ни ему, ни тому, кому он перешлёт снимок экрана. Здесь
 * такой ответ превращается в понятный текст и код ответа, а подробности
 * остаются в журнале устройства.
 */
export function readableFailure(input: RequestInfo | URL, message: string, httpStatus: number): Response {
  const item = {
    error: { json: { message, code: -32603, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus } } },
  };
  return new Response(JSON.stringify(Array.from({ length: batchSize(input) }, () => item)), {
    status: httpStatus,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Настоящий ответ API — JSON (в том числе его отказы); всё остальное — чужой
 * ответ по дороге. `unavailable` — понятный текст для сотрудника, к которому
 * дописывается код ответа и начало тела, чтобы по снимку экрана была видна причина.
 */
export async function ensureReadable(
  input: RequestInfo | URL,
  response: Response,
  unavailable: string,
): Promise<Response> {
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return response;

  const text = await response.clone().text();
  try {
    JSON.parse(text);
    return response;
  } catch {
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 60);
    console.warn(`API ответил не JSON: HTTP ${response.status.toString()} «${snippet}»`);
    return readableFailure(
      input,
      `${unavailable} (${response.status.toString()}${snippet === '' ? '' : `: ${snippet}`})`,
      response.status >= 400 ? response.status : 502,
    );
  }
}
