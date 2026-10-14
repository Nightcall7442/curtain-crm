import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { makeAvatarPreview } from './avatarPreview.service';

describe('превью фото сотрудника', () => {
  it('не шире 640, webp', async () => {
    const png = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: '#2a7d5c' },
    })
      .png()
      .toBuffer();

    const out = await makeAvatarPreview(png);
    expect(out).not.toBeNull();
    const meta = await sharp(out ?? Buffer.alloc(0)).metadata();

    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
  });

  it('маленькое фото не растягивается', async () => {
    const png = await sharp({ create: { width: 300, height: 400, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();

    const meta = await sharp((await makeAvatarPreview(png)) ?? Buffer.alloc(0)).metadata();

    expect(meta.width).toBe(300);
    expect(meta.height).toBe(400);
  });

  it('нечитаемый файл → null, без исключения', async () => {
    await expect(makeAvatarPreview(Buffer.from('not an image'))).resolves.toBeNull();
  });
});
