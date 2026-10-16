# Agent Middleware permit and receipt format (v0.1, draft)

License: Apache-2.0 (see [`../LICENSE`](../LICENSE)).

This directory describes the two signed objects an Agent Middleware gateway
produces, so that someone else can verify them, or implement a compatible
gateway, without reading the gateway's code.

| Document | What it covers |
|---|---|
| [`permit-v0.1.md`](permit-v0.1.md) | The scoped, signed authority an operator issues to an agent |
| [`receipt-v0.1.md`](receipt-v0.1.md) | The signed record of one governed tool call, and replay rules |
| [`key-set-v0.1.md`](key-set-v0.1.md) | How verification keys are published, rotated, and disabled |
| [`test-vectors/`](test-vectors/) | Signed receipt bundles plus tampered variants, with expected verifier results |

Status: **draft**. The format is what the reference gateway emits today. Field additions are expected;
breaking changes will bump the version. Propose changes by opening an issue.

## Conventions

- **Signature:** Ed25519 over the UTF-8 bytes of `signing_input`, exactly as
  transmitted. Verifiers must not re-serialize before verifying. A
  `signing_input` over 4096 bytes may instead be signed through a summary
  record; see [Summary record](#summary-record-signing_input-over-4096-bytes).
- **Canonical JSON (`awi-canonical-json/1`):** object keys sorted at every
  level, no insignificant whitespace (`,` and `:` separators), non-ASCII
  escaped as `\uXXXX`. Credit amounts and timestamps are strings by the time
  they are signed, so no number-formatting rules are needed.
- **`payload_hash`:** lowercase hex SHA-256 of the canonical JSON of the signed
  payload *without* the `payload_hash` member. It is itself part of the signed
  bytes.
- **`kid`:** the signing key id, inside the signed payload. Key selection uses
  the signed `kid`, never the unauthenticated envelope.

## Summary record (`signing_input` over 4096 bytes)

An issuer may sign a large `signing_input` indirectly. Instead of the payload,
it signs a small summary record that commits to the payload's SHA-256:

```json
{"alg":"Ed25519-sha256-envelope","kid":"<kid>","payload_sha256":"<hex>"}
```

- `kid` is the signing key id, the same value as the signed payload's `kid`.
- `payload_sha256` is the lowercase hex SHA-256 of the UTF-8 bytes of
  `signing_input`, exactly as transmitted.
- The record is serialized with `awi-canonical-json/1` (keys sorted, no
  whitespace), and the signature is pure Ed25519 (RFC 8032) over those bytes.
  It is **never** Ed25519ph (pre-hashed); the pre-hash is the SHA-256 inside
  the record, not a different signature scheme.

The bundle's `signature` field then carries a tag:

```text
Ed25519-sha256-envelope:<base64 Ed25519 signature over the summary record>
```

An untagged `signature` is always pure Ed25519 directly over `signing_input`,
at any size. Standard base64 contains no `:`, so the two forms cannot be
confused. The signed payload, including its `alg: "Ed25519"`, is identical
in both forms.

Verification steps:

1. Split `signature` at the first `:`. No `:` means a direct signature.
   A tag other than `Ed25519-sha256-envelope` means `malformed`.
2. Select the public key by the signed payload's `kid`, as for any receipt.
3. Direct: verify the signature over the UTF-8 bytes of `signing_input`.
4. Summary record: if `signing_input` is 4096 bytes or less, reject with
   `mismatch`. A small payload has exactly one valid signature form, the
   direct one. Otherwise compute SHA-256 over the UTF-8 bytes of
   `signing_input`, rebuild the summary record with that hex digest and the
   signed `kid`, serialize it canonically, and verify the signature over
   those bytes. A failed check is `invalid`.
5. Continue with the usual envelope and `payload_hash` checks.

A tampered payload changes `payload_sha256`, so the rebuilt record differs and
the signature fails. A verifier that predates this section sees an invalid
base64 `signature` and fails closed with `malformed`.

## What a valid signature does and does not prove

A verified receipt proves that the holder of the named key signed that record.
It does **not** prove that a downstream side effect happened, or happened only
once. The gateway guarantees at most one gateway dispatch and at most one debit
per accepted idempotency key; a remote side effect is deduplicated only if the
remote tool also honors the forwarded idempotency key. This is at most one capture, not a guarantee about remote effects.
