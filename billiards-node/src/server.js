// Точка входа. Запуск: npm run dev (перезапуск при изменении файлов)
// или npm start.

import { createApp } from "./app.js";
import { PORT, SEED_INITIAL_DATA } from "./config.js";
import { createDatabase } from "./db.js";
import { seedInitialData } from "./seed.js";

const db = createDatabase();
if (SEED_INITIAL_DATA) {
  seedInitialData(db);
}

const app = createApp(db);
app.listen(PORT, () => {
  console.log(`🎱 Бильярдный клуб: http://127.0.0.1:${PORT}`);
});
