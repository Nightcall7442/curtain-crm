import type { Workbook } from 'exceljs';

/**
 * Выгрузка и загрузка таблиц Excel.
 *
 * Коды приезжают от поставщика файлом и уходят обратно — в накладную, в
 * инвентаризацию, в переписку с оптовиком. Заводить их по одному руками
 * значит потратить вечер на то, что уже набрано.
 *
 * `exceljs` подгружается по требованию: это полтора мегабайта, которые нужны
 * в одном разделе панели и не нужны на входе в неё.
 */

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Из библиотеки нужен один класс — на нём и держится тип. */
type ExcelModule = { readonly Workbook: new () => Workbook };

/** CSV: разделитель `;` или `,`, поля в кавычках с удвоенными кавычками внутри. */
function parseCsv(text: string): readonly (readonly string[])[] {
  const delimiter = (text.split('\n')[0] ?? '').includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? '';
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

const loadExcel = async (): Promise<ExcelModule> => {
  // Сборка `exceljs` — CommonJS, и в одних сборщиках модуль приходит целиком,
  // в других — завёрнутым в `default`.
  const loaded = (await import('exceljs')) as unknown as ExcelModule & {
    readonly default?: ExcelModule;
  };

  return loaded.default ?? loaded;
};

/** Скачивание файла из памяти браузера: ссылка живёт ровно один клик. */
const download = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * Лист с шапкой из первой строки.
 *
 * Ширина колонок считается по самому длинному значению: файл открывают и
 * сразу печатают, а колонка, не влезшая в ширину, печатается решётками.
 */
export async function exportToXlsx(params: {
  readonly fileName: string;
  readonly sheetName: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}): Promise<void> {
  const excel = await loadExcel();
  const workbook = new excel.Workbook();
  const sheet = workbook.addWorksheet(params.sheetName);

  sheet.addRow([...params.headers]);
  for (const row of params.rows) sheet.addRow([...row]);

  sheet.getRow(1).font = { bold: true };
  // Шапка остаётся на месте при прокрутке — в длинном списке иначе не понять,
  // какая колонка какая.
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.columns = params.headers.map((header, index) => ({
    width: Math.min(
      60,
      Math.max(12, header.length + 2, ...params.rows.map((row) => (row[index] ?? '').length + 2)),
    ),
  }));

  const buffer = await workbook.xlsx.writeBuffer();
  download(new Blob([buffer], { type: MIME }), params.fileName);
}

/**
 * Чтение первого листа: шапка отбрасывается, ячейки берутся текстом.
 *
 * Именно текстом, как их видит человек: код «00123» лежит то строкой, то
 * числом, а иногда результатом формулы — и во всех трёх случаях в накладной
 * напечатано одно и то же.
 */
export async function readXlsx(file: File): Promise<readonly (readonly string[])[]> {
  const excel = await loadExcel();
  const workbook = new excel.Workbook();

  /*
    Старый `.xls` (Excel 97–2003) — другой формат, библиотека его не читает.
    Сказать об этом словами лучше, чем упасть на разборе zip-архива с
    сообщением про «end of central directory».
  */
  if (/\.xls$/i.test(file.name)) {
    throw new Error('Старый формат .xls не поддерживается — сохраните файл как .xlsx');
  }

  // CSV из 1С и Google-таблиц: свой разбор в десять строк, библиотеке для
  // него нужен потоковый ввод, которого в браузере нет.
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());

  await workbook.xlsx.load(await file.arrayBuffer());

  const sheet = workbook.worksheets[0];
  if (sheet === undefined) return [];

  const rows: string[][] = [];

  // Шапка НЕ отбрасывается: какая строка шапка и где какая колонка, решает
  // вызывающий по названиям, — файлы поставщиков начинаются с чего угодно.
  sheet.eachRow((row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      values[column - 1] = cell.text.trim();
    });

    const cells = Array.from(values, (value: string | undefined) => value ?? '');
    if (cells.some((value) => value !== '')) rows.push(cells);
  });

  return rows;
}
