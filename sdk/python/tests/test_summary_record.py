"""Summary-record signatures: payloads over 4096 bytes signed via their SHA-256.

The signature covers the canonical JSON of ``{alg, kid, payload_sha256}`` and
is tagged ``Ed25519-sha256-envelope:``. Untagged signatures stay pure Ed25519
over ``signing_input``. See ``spec/README.md``.
"""

from __future__ import annotations

import base64
import hashlib

import pytest

pytest.importorskip("cryptography")

from cryptography.hazmat.primitives.asymmetric.ed25519 import (  # noqa: E402
    Ed25519PrivateKey,
)

from b2a_sdk.receipt_verifier import (  # noqa: E402
    SUMMARY_RECORD_ALG,
    SUMMARY_RECORD_THRESHOLD_BYTES,
    VerificationStatus,
    canonical_json,
    verify_bundle,
)

KID = "key-1"
SIGNER = Ed25519PrivateKey.from_private_bytes(bytes(range(32)))
OTHER = Ed25519PrivateKey.from_private_bytes(bytes(range(32, 64)))


def _public(key: Ed25519PrivateKey) -> bytes:
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

    return key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)


KEYS = {KID: _public(SIGNER)}


def _signing_input(size: int) -> str:
    """Canonical receipt payload padded to exactly ``size`` UTF-8 bytes."""
    base = {"kid": KID, "receipt_id": "rcpt-1", "pad": ""}
    pad = size - len(canonical_json(base))
    assert pad >= 0
    signing_input = canonical_json({**base, "pad": "x" * pad})
    assert len(signing_input.encode("utf-8")) == size
    return signing_input


def _direct(key: Ed25519PrivateKey, signing_input: str) -> str:
    return base64.b64encode(key.sign(signing_input.encode("utf-8"))).decode()


def _summary(key: Ed25519PrivateKey, signing_input: str) -> str:
    record = canonical_json(
        {
            "alg": SUMMARY_RECORD_ALG,
            "kid": KID,
            "payload_sha256": hashlib.sha256(signing_input.encode("utf-8")).hexdigest(),
        }
    )
    signature = base64.b64encode(key.sign(record.encode("utf-8"))).decode()
    return f"{SUMMARY_RECORD_ALG}:{signature}"


def _bundle(signing_input: str, signature: str) -> dict:
    return {
        "receipt_id": "rcpt-1",
        "kid": KID,
        "signing_input": signing_input,
        "signature": signature,
    }


SMALL = _signing_input(512)
LARGE = _signing_input(SUMMARY_RECORD_THRESHOLD_BYTES + 1000)


def test_small_payload_direct_signature_verifies():
    assert (
        verify_bundle(_bundle(SMALL, _direct(SIGNER, SMALL)), KEYS).status
        is VerificationStatus.VERIFIED
    )


def test_large_payload_summary_record_verifies():
    result = verify_bundle(_bundle(LARGE, _summary(SIGNER, LARGE)), KEYS)

    assert result.status is VerificationStatus.VERIFIED
    assert result.receipt_id == "rcpt-1"


def test_large_payload_direct_signature_still_verifies():
    assert (
        verify_bundle(_bundle(LARGE, _direct(SIGNER, LARGE)), KEYS).status
        is VerificationStatus.VERIFIED
    )


def test_tampered_large_payload_is_rejected():
    tampered = LARGE.replace("xxxx", "xxxy", 1)
    assert len(tampered) == len(LARGE)

    result = verify_bundle(_bundle(tampered, _summary(SIGNER, LARGE)), KEYS)

    assert result.status is VerificationStatus.INVALID


def test_summary_record_from_wrong_key_is_rejected():
    result = verify_bundle(_bundle(LARGE, _summary(OTHER, LARGE)), KEYS)

    assert result.status is VerificationStatus.INVALID


def test_summary_record_is_not_a_direct_signature_and_vice_versa():
    """A summary signature presented untagged (or the reverse) must not verify."""
    untagged = _summary(SIGNER, LARGE).split(":", 1)[1]
    tagged = f"{SUMMARY_RECORD_ALG}:{_direct(SIGNER, LARGE)}"

    assert verify_bundle(_bundle(LARGE, untagged), KEYS).status is VerificationStatus.INVALID
    assert verify_bundle(_bundle(LARGE, tagged), KEYS).status is VerificationStatus.INVALID


@pytest.mark.parametrize("size", [512, SUMMARY_RECORD_THRESHOLD_BYTES])
def test_summary_record_at_or_below_threshold_is_rejected(size):
    """One valid signature form per small payload: no downgrade confusion."""
    signing_input = _signing_input(size)

    result = verify_bundle(_bundle(signing_input, _summary(SIGNER, signing_input)), KEYS)

    assert result.status is VerificationStatus.MISMATCH


def test_summary_record_just_above_threshold_verifies():
    signing_input = _signing_input(SUMMARY_RECORD_THRESHOLD_BYTES + 1)

    result = verify_bundle(_bundle(signing_input, _summary(SIGNER, signing_input)), KEYS)

    assert result.status is VerificationStatus.VERIFIED


@pytest.mark.parametrize("scheme", ["Ed25519ph", "Ed25519", "ecdsa"])
def test_unknown_or_prehash_signature_tag_is_malformed(scheme):
    signature = f"{scheme}:{_summary(SIGNER, LARGE).split(':', 1)[1]}"

    result = verify_bundle(_bundle(LARGE, signature), KEYS)

    assert result.status is VerificationStatus.MALFORMED
