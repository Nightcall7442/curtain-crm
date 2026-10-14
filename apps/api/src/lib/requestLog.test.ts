import { describe, expect, it } from 'vitest';

import { withoutQuery } from './requestLog';

describe('строка журнала запросов', () => {
  it('без строки запроса: токен табло и подпись файла в журнал не попадают', () => {
    expect(withoutQuery('<-- GET /trpc/display.board?batch=1&input=%7B%22token%22%3A%22SECRET%22%7D')).toBe(
      '<-- GET /trpc/display.board',
    );
    expect(withoutQuery('--> GET /files/avatars/7/a.webp?expires=1&sig=abc \u001b[32m200\u001b[0m 3ms')).toBe(
      '--> GET /files/avatars/7/a.webp \u001b[32m200\u001b[0m 3ms',
    );
  });

  it('строка без запроса не меняется', () => {
    expect(withoutQuery('--> POST /trpc/auth.login 200 120ms')).toBe('--> POST /trpc/auth.login 200 120ms');
  });
});
