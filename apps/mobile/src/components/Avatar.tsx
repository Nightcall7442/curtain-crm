import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Круглое фото сотрудника.
 *
 * Существует ради одной вещи — КАДРА. Корпоративная съёмка портретная
 * (309×433), а круг квадратный, и обычный `cover` срезает сверху и снизу
 * поровну: у всех оказывалась отрезана макушка. Голова у портрета сверху,
 * поэтому квадрат берётся от верхнего края снимка, а лишнее уходит снизу.
 *
 * Пропорции снимка узнаются из самого файла (`onLoad`), а не задаются
 * числом: в базе лежат и телефонные снимки, у которых формат другой.
 * Пока файл не загрузился — обычный `cover`; кадр поправится сам, когда
 * размеры станут известны.
 *
 * Прямоугольные фото на карточке профиля и на доске дней рождения этот
 * компонент не трогает: там рамка держит соотношение съёмки и резать
 * нечего.
 */
export function Avatar({
  uri,
  size,
  style,
  fallback,
}: {
  readonly uri: string | null;
  readonly size: number;
  /** Оформление рамки: фон, кольцо, обводка. Размер задаёт `size`. */
  readonly style?: StyleProp<ViewStyle>;
  /** Что показать вместо фото: инициалы, значок. */
  readonly fallback: ReactNode;
}): ReactElement {
  const [box, setBox] = useState<{ readonly width: number; readonly height: number } | null>(null);
  /* Ссылка на фото подписана и истекает — неудача загрузки обычный случай,
     а не ошибка: молча показываем то, что дал вызывающий. */
  const [hasFailed, setHasFailed] = useState(false);

  const showsPhoto = uri !== null && !hasFailed;

  /*
    Размеры снимка спрашиваются отдельно, а не берутся из `onLoad`.

    В `onLoad` они приходят только в родных сборках: в браузере поле
    `nativeEvent.source` пустое, и кадр молча оставался бы прежним — тем
    самым, с отрезанной макушкой. `Image.getSize` работает и там и там,
    а повторной загрузки не делает: файл уже в кеше.
  */
  useEffect(() => {
    if (uri === null) return;

    let isCancelled = false;
    setBox(null);

    Image.getSize(
      uri,
      (width, height) => {
        if (!isCancelled && width > 0 && height > 0) setBox(cropBox(size, width, height));
      },
      () => {
        if (!isCancelled) setHasFailed(true);
      },
    );

    return () => {
      isCancelled = true;
    };
  }, [uri, size]);

  return (
    <View
      style={[
        { width: size, height: size },
        style,
        styles.frame,
        // Фото прижимается к верху рамки — в этом весь смысл; инициалы
        // остаются по центру.
        showsPhoto ? styles.top : styles.middle,
      ]}
    >
      {showsPhoto ? (
        <Image
          source={{ uri }}
          style={box ?? styles.fill}
          resizeMode="cover"
          onError={() => {
            setHasFailed(true);
          }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        fallback
      )}
    </View>
  );
}

/**
 * Во что растянуть снимок, чтобы в рамку попал его ВЕРХНИЙ квадрат.
 *
 * Портрет: ширина по рамке, высота вырастает — низ уезжает за край.
 * Пейзаж: высота по рамке, ширина шире рамки — обрезается поровну с боков,
 * там лицо обычно в середине.
 */
function cropBox(
  size: number,
  width: number,
  height: number,
): { readonly width: number; readonly height: number } {
  const ratio = height / width;
  return ratio >= 1
    ? { width: size, height: size * ratio }
    : { width: size / ratio, height: size };
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    alignItems: 'center',
  },
  top: {
    justifyContent: 'flex-start',
  },
  middle: {
    justifyContent: 'center',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
});
