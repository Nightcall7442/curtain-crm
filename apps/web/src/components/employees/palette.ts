import {
  DEPARTMENT_LABELS_RU,
  EMPLOYMENT_TYPE_LABELS_RU,
  type Department,
  type EmploymentType,
} from '@curtain-crm/shared';

/**
 * Категориальная палитра для кадровых диаграмм.
 *
 * Переиспользует проверенный набор цветов производственного конвейера
 * (`--stage-*`): он уже прошёл проверку на различимость соседних оттенков
 * и контраст к тёмному фону, так что заводить второй набор — значит заводить
 * второй набор проблем.
 *
 * Цвета назначаются в ФИКСИРОВАННОМ порядке по ключу, а не по позиции в
 * отфильтрованном списке: иначе при скрытии пустого подразделения остальные
 * перекрасились бы, и диаграмма «до» и «после» фильтра читалась бы как
 * разные данные.
 */

const CATEGORICAL = [
  'rgb(var(--stage-done))',
  'rgb(var(--stage-installation))',
  'rgb(var(--stage-cutting))',
  'rgb(var(--stage-sewing))',
  'rgb(var(--stage-new))',
  'rgb(var(--stage-qc))',
  'rgb(var(--stage-ready))',
] as const;

const DEPARTMENT_ORDER: readonly Department[] = [
  'sewing',
  'installation',
  'cutting',
  'sales',
  'administration',
  'quality',
  'other',
];

export function departmentColor(department: Department): string {
  const index = DEPARTMENT_ORDER.indexOf(department);
  return CATEGORICAL[index === -1 ? CATEGORICAL.length - 1 : index] ?? CATEGORICAL[0];
}

export function departmentLabel(department: Department): string {
  return DEPARTMENT_LABELS_RU[department];
}

const EMPLOYMENT_ORDER: readonly EmploymentType[] = [
  'permanent',
  'probation',
  'temporary',
  'intern',
];

export function employmentColor(type: EmploymentType): string {
  const index = EMPLOYMENT_ORDER.indexOf(type);
  return CATEGORICAL[index === -1 ? 0 : index] ?? CATEGORICAL[0];
}

export function employmentLabel(type: EmploymentType): string {
  return EMPLOYMENT_TYPE_LABELS_RU[type];
}

/** Цвет группы стажа — по позиции в фиксированном списке групп. */
export function tenureColor(index: number): string {
  return CATEGORICAL[index % CATEGORICAL.length] ?? CATEGORICAL[0];
}
