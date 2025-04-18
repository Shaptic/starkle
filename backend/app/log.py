from typing import *

import functools
import logging
import os


DEFAULT_FMT = "[{asctime} {levelname: <4}]: {message}"


class CustomLoggerAdapter(logging.LoggerAdapter):
    def process(self, msg, kwargs):
        kwargs["extra"] = {**self.extra, **kwargs.get("extra", {})}  # type: ignore
        return f"{msg}", kwargs


def prepare_log(
    name: Optional[str] = None,
    format: Optional[str] = DEFAULT_FMT,
    extra_defaults: Optional[dict] = {},
) -> logging.Logger:
    """Provides uniform behavior for cross-module logging."""
    fmt = logging.Formatter(format, style="{", datefmt="%H:%M:%S")
    stdout = logging.StreamHandler()
    log = logging.getLogger(name or __name__)

    # Convert the string to a logging level constant
    log_level = getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)

    log.setLevel(log_level)
    stdout.setLevel(log_level)
    stdout.setFormatter(fmt)

    log.addHandler(stdout)

    # LoggerAdapter should inherit from Logger for type hinting purposes, but it
    # doesn't T_T. So we cast it because they behave the same way.
    return CustomLoggerAdapter(log, extra_defaults)  # type: ignore
