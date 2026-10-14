"""Offline verifier for Agent Middleware signed receipts.

Only the receipt verifier and its CLI ship in this package. Neither imports a
network client at import time; ``cryptography`` is needed only to check
signatures and comes from the ``verify`` extra.
"""

from __future__ import annotations

from . import receipt_verifier, verify_cli

__all__ = ["receipt_verifier", "verify_cli"]
__version__ = "0.5.0"
