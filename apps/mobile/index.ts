import { registerRootComponent } from 'expo';

import App from './App';

/**
 * Точка входа.
 *
 * `registerRootComponent` вызывает `AppRegistry.registerComponent` и
 * дополнительно настраивает окружение Expo — как в dev-клиенте, так и в
 * собранном приложении.
 */
registerRootComponent(App);
