import * as Location from 'expo-location';
import { useCallback, useState } from 'react';
import { useLocale } from './useLocale';

/**
 * Получение координат для отметки смены.
 *
 * Разрешение запрашивается в момент нажатия кнопки, а не при запуске
 * приложения: системный диалог без объяснения контекста чаще отклоняют,
 * а без геолокации отметить смену нельзя вовсе.
 *
 * Точность `Balanced`, а не `Highest`: радиус филиала — 100 метров, а
 * максимальная точность держит GPS включённым дольше и заметно ест батарею.
 */

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface LocationState {
  readonly requestPosition: () => Promise<Coordinates | null>;
  readonly isRequesting: boolean;
  /** Понятное пользователю объяснение отказа. */
  readonly error: string | null;
}

export function useLocation(): LocationState {
  const { m } = useLocale();
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestPosition = useCallback(async (): Promise<Coordinates | null> => {
    setIsRequesting(true);
    setError(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setError(
          permission.canAskAgain
            ? m('geo.denied')
            : m('geo.blocked'),
        );
        return null;
      }

      const services = await Location.hasServicesEnabledAsync();
      if (!services) {
        setError(m('geo.off'));
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch {
      setError(m('geo.failed'));
      return null;
    } finally {
      setIsRequesting(false);
    }
  }, [m]);

  return { requestPosition, isRequesting, error };
}
