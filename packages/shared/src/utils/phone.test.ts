import { describe, expect, it } from 'vitest';

import { formatPhone, isValidPhone, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    '901234567',
    '+998901234567',
    '998901234567',
    '+998 90 123 45 67',
    '8 90 123-45-67',
    '(90) 123 45 67',
  ])('приводит «%s» к E.164', (input) => {
    expect(normalizePhone(input)).toBe('+998901234567');
  });

  it.each([
    ['', 'пустая строка'],
    ['12345', 'слишком короткий'],
    ['9012345678', 'слишком длинный'],
    ['+7 900 123 45 67', 'чужой код страны'],
    ['001234567', 'код оператора начинается с 0'],
    ['101234567', 'код оператора начинается с 1'],
    ['телефона нет', 'не содержит цифр'],
  ])('отклоняет «%s» (%s)', (input) => {
    expect(normalizePhone(input)).toBeNull();
    expect(isValidPhone(input)).toBe(false);
  });
});

describe('formatPhone', () => {
  it('форматирует корректный номер для интерфейса', () => {
    expect(formatPhone('901234567')).toBe('+998 90 123 45 67');
  });

  it('возвращает ввод без изменений, если номер не распознан', () => {
    expect(formatPhone('нет номера')).toBe('нет номера');
  });
});
