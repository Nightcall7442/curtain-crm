import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import QRCode from 'react-qr-code';

/**
 * QR-код как PNG (data URL) — для вставки в Excel.
 *
 * На странице QR рисует `react-qr-code` как SVG; в ячейку Excel вектор не
 * вставить, а тянуть вторую библиотеку ради растрового QR незачем: тот же
 * SVG рисуется на холст и снимается PNG. Всё в браузере, без сервера.
 */
export async function qrToPng(value: string, size = 128): Promise<string> {
  const svg = renderToStaticMarkup(createElement(QRCode, { value, size }));
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => {
      resolve();
    };
    image.onerror = () => {
      reject(new Error('QR не отрисовался'));
    };
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Холст недоступен');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}
