import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DiskStorageDriver, verifyFileUrl } from './storage.service';

const SECRET = 's'.repeat(32);

describe('ссылки на файлы для табло', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'storage-'));
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(root, { recursive: true, force: true });
  });

  it('stableWithinHour: два вызова в пределах часа дают один адрес, подпись проходит', async () => {
    const driver = new DiskStorageDriver(root, 'http://x/files', SECRET);

    vi.setSystemTime(new Date('2026-10-14T07:05:00Z'));
    const first = await driver.getUrl('avatars/1/a.jpg', { stableWithinHour: true });
    vi.setSystemTime(new Date('2026-10-14T07:55:00Z'));
    const second = await driver.getUrl('avatars/1/a.jpg', { stableWithinHour: true });

    expect(first).toBe(second);
    const url = new URL(second);
    expect(
      verifyFileUrl({
        key: 'avatars/1/a.jpg',
        expires: url.searchParams.get('expires'),
        signature: url.searchParams.get('sig'),
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it('stableWithinHour: ссылка из конца часа живёт ещё не меньше часа', async () => {
    const driver = new DiskStorageDriver(root, 'http://x/files', SECRET);

    vi.setSystemTime(new Date('2026-10-14T07:59:30Z'));
    const url = new URL(await driver.getUrl('avatars/1/a.jpg', { stableWithinHour: true }));
    const expiresAt = Number(url.searchParams.get('expires'));

    expect(expiresAt - Date.parse('2026-10-14T07:59:30Z') / 1000).toBeGreaterThanOrEqual(3600);
  });

  it('без опции адрес по-прежнему меняется со временем', async () => {
    const driver = new DiskStorageDriver(root, 'http://x/files', SECRET);

    vi.setSystemTime(new Date('2026-10-14T07:05:00Z'));
    const first = await driver.getUrl('avatars/1/a.jpg');
    vi.setSystemTime(new Date('2026-10-14T07:06:00Z'));
    const second = await driver.getUrl('avatars/1/a.jpg');

    expect(first).not.toBe(second);
  });

  it('read возвращает то, что было загружено', async () => {
    const driver = new DiskStorageDriver(root, 'http://x/files', SECRET);
    await driver.upload({ key: 'avatars/1/b.png', body: Buffer.from('abc'), mimeType: 'image/png' });

    expect((await driver.read('avatars/1/b.png')).toString()).toBe('abc');
  });
});
