import { Alert, Platform, type AlertButton, type AlertOptions } from 'react-native';

/**
 * `Alert.alert` для приложения в браузере.
 *
 * В react-native-web `Alert.alert` — пустышка: ни окна, ни нажатой кнопки.
 * В приложении на телефоне через него идут все подтверждения («Удалить
 * фото?») и сообщения об ошибках — а в PWA они молча пропадали, и действие,
 * которое ждёт «Да», просто не происходило. Здесь вызов кладётся в очередь,
 * а показывает её `WebAlertHost` — окном в стиле приложения.
 *
 * Подменяется сам `Alert.alert`: 85 мест вызова остаются как есть, и на
 * телефоне по-прежнему открывается системный диалог.
 */
export interface WebAlertRequest {
  readonly id: number;
  readonly title: string;
  readonly message: string | undefined;
  readonly buttons: readonly AlertButton[];
  readonly options: AlertOptions | undefined;
}

type Listener = (queue: readonly WebAlertRequest[]) => void;

let nextId = 1;
let queue: readonly WebAlertRequest[] = [];
const listeners = new Set<Listener>();

const emit = (): void => {
  listeners.forEach((listener) => {
    listener(queue);
  });
};

/** Подписка на очередь; сразу отдаёт текущую. */
export function subscribeWebAlerts(listener: Listener): () => void {
  listeners.add(listener);
  listener(queue);
  return () => {
    listeners.delete(listener);
  };
}

/** Убрать окно из очереди — после нажатия кнопки или закрытия. */
export function closeWebAlert(id: number): void {
  queue = queue.filter((request) => request.id !== id);
  emit();
}

/** Включить окна в браузере; на телефоне ничего не делает. */
export function installWebAlert(): void {
  if (Platform.OS !== 'web') return;
  Alert.alert = (title, message, buttons, options) => {
    queue = [
      ...queue,
      { id: nextId++, title, message, buttons: buttons ?? [], options },
    ];
    emit();
  };
}
