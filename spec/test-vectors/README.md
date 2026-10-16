# Test vectors

- `keys.json`: key set holding the public half of the fixed test seed
  `bytes(range(32))`. **Test use only.**
- `receipts.json`: cases with a `bundle`, optional `keys` override, and the
  `expect`ed verifier status. Fixed test cases
  plus tampered variants. `summary_record.*` cases cover the summary-record
  signature form: small direct, large summary record, large direct, tampered
  payload, wrong signing key, a summary record on a small payload (rejected),
  and an unknown signature tag. `large_summary.wrong_key` is signed with the
  test seed `bytes(range(32, 64))` under the published `kid`.

Check an implementation:

```bash
python verifier/check_vectors.py          # Python reference verifier
(cd sdk/typescript && npm test)           # TypeScript verifier
```
