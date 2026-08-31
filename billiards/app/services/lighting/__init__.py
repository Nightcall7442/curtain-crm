"""Точка получения контроллера освещения.

Здесь выбирается реализация. При появлении интеграции с MOES
заменяется только эта фабрика.
"""

from app.services.lighting.base import LightingController
from app.services.lighting.mock import MockLightingController

_controller: LightingController = MockLightingController()


def get_lighting_controller() -> LightingController:
    return _controller


__all__ = ["LightingController", "MockLightingController", "get_lighting_controller"]
