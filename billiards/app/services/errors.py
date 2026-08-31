"""Доменные ошибки.

Сервисы бросают их, а API-слой единообразно превращает в HTTP-ответы:
NotFoundError -> 404, ConflictError -> 409.
"""


class DomainError(Exception):
    """Базовая ошибка бизнес-логики."""


class NotFoundError(DomainError):
    """Запрошенная сущность не существует."""


class ConflictError(DomainError):
    """Действие противоречит текущему состоянию (занятый/свободный стол и т.п.)."""
