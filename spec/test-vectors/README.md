# Test vectors

- `keys.json`: key set holding the public half of the fixed test seed
  `bytes(range(32))`. **Test use only.**
- `receipts.json`: cases with a `bundle`, optional `keys` override, and the
  `expect`ed verifier status. Fixed test cases
  plus tampered variants.

Check an implementation:

```bash
python verifier/check_vectors.py          # Python reference verifier
(cd sdk/typescript && npm test)           # TypeScript verifier
```
