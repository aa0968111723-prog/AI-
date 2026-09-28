"""Storage error types mapped by the API layer to HTTP 400/404/409."""


class StorageError(Exception):
    """Base storage error."""


class NotFoundError(StorageError):
    """Referenced project, task, or channel does not exist."""


class InvalidInputError(StorageError):
    """Caller supplied values that fail validation."""


class CapacityError(StorageError):
    """Channel waiting queue is at the 10-item cap."""


class ConflictError(StorageError):
    """Operation is not valid for the current task or channel state."""
