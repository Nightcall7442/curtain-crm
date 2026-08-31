"""Конфигурация приложения.

Все настройки собраны в одном месте; значения можно переопределить
переменными окружения, что упрощает деплой без правки кода.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DATABASE_URL: str = os.environ.get(
    "BILLIARDS_DATABASE_URL",
    f"sqlite:///{BASE_DIR / 'billiards.db'}",
)

# Сидинг стартовых данных при первом запуске на пустой базе.
# В тестах отключается: BILLIARDS_SEED=0.
SEED_INITIAL_DATA: bool = os.environ.get("BILLIARDS_SEED", "1") == "1"

APP_TITLE = "Billiards Club Management"
APP_VERSION = "0.1.0"
