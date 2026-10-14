import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { generateDisplayToken, hashDisplayToken } from './displayLinks.service';

describe('токен ссылки для ТВ', () => {
  it('43 символа base64url, хеш — sha256 этого токена', () => {
    const { token, hash } = generateDisplayToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hashDisplayToken(token)).toBe(hash);
  });

  it('два токена не совпадают', () => {
    expect(generateDisplayToken().token).not.toBe(generateDisplayToken().token);
  });
});
