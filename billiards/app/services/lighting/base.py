"""Интерфейс управления освещением столов.

Frontend и API ничего не знают о конкретном оборудовании — они работают
только с этим интерфейсом. Сегодня реализация Mock, позже её заменит
интеграция с MOES: достаточно добавить новый класс и вернуть его из
get_lighting_controller(), не трогая остальной код.
"""

from abc import ABC, abstractmethod


class LightingController(ABC):
    """Управление светом над конкретным столом."""

    @abstractmethod
    def turn_light_on(self, table_id: int) -> None:
        """Включить свет над столом."""

    @abstractmethod
    def turn_light_off(self, table_id: int) -> None:
        """Выключить свет над столом."""

    @abstractmethod
    def is_light_on(self, table_id: int) -> bool:
        """Текущее состояние света над столом."""
