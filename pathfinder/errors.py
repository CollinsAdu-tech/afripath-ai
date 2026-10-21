"""Errors raised by the engine and the knowledge-base layer."""

from __future__ import annotations


class KnowledgeBaseError(Exception):
    """The knowledge base is missing, empty or structurally unusable."""

    code = "KB_INVALID"

    def __init__(self, message: str, issues: list[dict] | None = None):
        super().__init__(message)
        self.issues = issues or []


class InputValidationError(Exception):
    """The student's answers are malformed (wrong type or shape)."""

    code = "INVALID_INPUT"

    def __init__(self, details: list[dict]):
        super().__init__("The request contains invalid answers.")
        self.details = details  # [{field, code, message}]


class CareerNotFoundError(Exception):
    code = "CAREER_NOT_FOUND"

    def __init__(self, career_id: object):
        super().__init__(f'No career with id "{str(career_id)[:80]}" exists in the knowledge base.')
