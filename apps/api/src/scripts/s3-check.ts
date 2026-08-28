/**
 * Проверка S3-драйвера против локального S3-совместимого сервера.
 *
 * Настоящего бакета под рукой нет, а отдавать непроверенный драйвер, через
 * который пойдут все фотографии заказов, нельзя. Поэтому здесь поднимается
 * минимальный сервер, реализующий ровно то подмножество S3, которое драйвер
 * использует: `PUT`, `GET`, `HEAD` и `DELETE` объекта по пути
 * `/<bucket>/<key>` (путевой стиль).
 *
 * ЧТО ЭТО ПРОВЕРЯЕТ: что драйвер обращается по правильным адресам правильными
 * методами, передаёт тело и тип, отличает отсутствующий объект от сбоя,
 * а подписанная ссылка действительно приводит к объекту.
 *
 * ЧЕГО НЕ ПРОВЕРЯЕТ: подпись SigV4 — сервер её не сверяет, это забота SDK
 * и настоящего хранилища. Первый прогон против реального бакета всё равно
 * нужен, но уже без риска обнаружить, что драйвер зовёт не те эндпойнты.
 *
 * Запуск: `pnpm --filter @curtain-crm/api s3:check`
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { S3StorageDriver } from '../services/storage.service';

const BUCKET = 'curtain-crm-test';

interface StoredBlob {
  readonly body: Buffer;
  readonly contentType: string;
}

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  process.stdout.write(
    `${ok ? '  OK  ' : ' FAIL '} ${name}${detail === '' ? '' : ` — ${detail}`}\n`,
  );
}

/** Минимальный S3: хранит объекты в памяти и пишет журнал обращений. */
function startFakeS3(): Promise<{
  readonly url: string;
  readonly objects: Map<string, StoredBlob>;
  readonly log: { method: string; path: string }[];
  readonly stop: () => Promise<void>;
}> {
  const objects = new Map<string, StoredBlob>();
  const log: { method: string; path: string }[] = [];

  const readBody = async (request: IncomingMessage): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  };

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      const method = request.method ?? 'GET';
      const path = (request.url ?? '/').split('?')[0] ?? '/';
      log.push({ method, path });

      const prefix = `/${BUCKET}/`;
      if (!path.startsWith(prefix)) {
        response.writeHead(404).end();
        return;
      }
      const key = decodeURIComponent(path.slice(prefix.length));

      if (method === 'PUT') {
        objects.set(key, {
          body: await readBody(request),
          contentType: request.headers['content-type'] ?? '',
        });
        response.writeHead(200, { ETag: '"stub"' }).end();
        return;
      }

      const blob = objects.get(key);

      if (method === 'HEAD') {
        if (blob === undefined) {
          response.writeHead(404).end();
          return;
        }
        response
          .writeHead(200, {
            'Content-Length': blob.body.byteLength.toString(),
            'Content-Type': blob.contentType,
          })
          .end();
        return;
      }

      if (method === 'GET') {
        if (blob === undefined) {
          response.writeHead(404).end();
          return;
        }
        response.writeHead(200, { 'Content-Type': blob.contentType }).end(blob.body);
        return;
      }

      if (method === 'DELETE') {
        objects.delete(key);
        response.writeHead(204).end();
        return;
      }

      response.writeHead(405).end();
    })();
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port.toString()}`,
        objects,
        log,
        stop: () =>
          new Promise<void>((done) => {
            server.close(() => {
              done();
            });
          }),
      });
    });
  });
}

async function main(): Promise<void> {
  const fake = await startFakeS3();
  process.stdout.write(`Локальный S3-совместимый сервер: ${fake.url}\n\n`);

  const driver = new S3StorageDriver(BUCKET, {
    endpoint: fake.url,
    region: 'eu-central-1',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
  });

  try {
    const key = 'orders/42/qc/1f0f5f26-0000-4000-8000-000000000001.jpg';
    const body = Buffer.from('фотография шва', 'utf8');

    /* --- Загрузка ---------------------------------------------------------- */
    const stored = await driver.upload({
      key,
      body: new Uint8Array(body),
      mimeType: 'image/jpeg',
    });

    check('upload: вернул ключ и размер', stored.key === key && stored.sizeBytes === body.byteLength);

    const saved = fake.objects.get(key);
    check(
      'upload: тело дошло до хранилища без искажений',
      saved !== undefined && saved.body.equals(body),
      saved === undefined ? 'объекта нет' : `${saved.body.byteLength.toString()} байт`,
    );
    check(
      'upload: Content-Type проставлен',
      saved?.contentType === 'image/jpeg',
      saved?.contentType ?? 'нет',
    );
    check(
      'upload: путевой стиль адреса, а не поддомен',
      fake.log.some((entry) => entry.method === 'PUT' && entry.path === `/${BUCKET}/${key}`),
      fake.log.find((entry) => entry.method === 'PUT')?.path ?? 'нет запроса',
    );

    /* --- Наличие ----------------------------------------------------------- */
    check('exists: существующий объект', await driver.exists(key));
    check(
      'exists: отсутствующий объект — false, а не исключение',
      !(await driver.exists('orders/42/qc/00000000-0000-4000-8000-000000000002.jpg')),
    );
    check(
      'exists: запрашивает HEAD, а не тянет тело',
      fake.log.some((entry) => entry.method === 'HEAD'),
    );

    /* --- Подписанная ссылка ------------------------------------------------ */
    const url = await driver.getUrl(key, { expiresInSeconds: 60 });
    const parsed = new URL(url);

    check('getUrl: адрес указывает на нужный объект', parsed.pathname === `/${BUCKET}/${key}`);
    check(
      'getUrl: ссылка подписана и ограничена по времени',
      parsed.searchParams.get('X-Amz-Signature') !== null &&
        parsed.searchParams.get('X-Amz-Expires') === '60',
      `срок ${parsed.searchParams.get('X-Amz-Expires') ?? 'нет'} с`,
    );

    const fetched = await fetch(url);
    const fetchedBody = Buffer.from(await fetched.arrayBuffer());
    check(
      'getUrl: по ссылке отдаётся тот же файл',
      fetched.status === 200 && fetchedBody.equals(body),
      `${fetched.status.toString()}, ${fetchedBody.byteLength.toString()} байт`,
    );

    /* --- Удаление ---------------------------------------------------------- */
    await driver.delete(key);
    check('delete: объект удалён', !fake.objects.has(key));
    check('delete: повторное удаление не падает', await driver.delete(key).then(() => true, () => false));

    /* --- Защита ключа ------------------------------------------------------ */
    check(
      'ключ с выходом за пределы каталога отбивается',
      await driver.exists('../../etc/passwd').then(() => false, () => true),
    );
  } finally {
    await fake.stop();
  }

  const failed = results.filter((entry) => !entry.ok);
  process.stdout.write(
    `\n${(results.length - failed.length).toString()} из ${results.length.toString()} проверок пройдено\n`,
  );
  if (failed.length > 0) process.exit(1);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
