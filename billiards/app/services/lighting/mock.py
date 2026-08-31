"""Mock-реализация освещения: хранит состояние в памяти процесса.

Поведение повторяет будущую интеграцию с реальными реле (MOES):
включение/выключение по table_id и чтение текущего состояния.
"""

import logging

from app.services.lighting.base import LightingController

logger = logging.getLogger(__name__)


class MockLightingController(LightingController):
    def __init__(self) -> None:
        self._on: set[int] = set()

    def turn_light_on(self, table_id: int) -> None:
        self._on.add(table_id)
        logger.info("Mock lighting: light ON for table %s", table_id)

    def turn_light_off(self, table_id: int) -> None:
        self._on.discard(table_id)
        logger.info("Mock lighting: light OFF for table %s", table_id)

    def is_light_on(self, table_id: int) -> bool:
        return table_id in self._on
