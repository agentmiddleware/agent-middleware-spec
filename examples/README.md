# Examples

Verify a receipt bundle against a key set you already hold:

```bash
pip install -e "./sdk/python[verify]"
b2a-verify-receipt --bundle receipt.json --keys trust-keys.json
echo $?   # 0 verified, 1 rejected, 2 cannot tell
```

Same check from TypeScript:

```ts
import { keySetFromDocument, verifyBundle } from "../sdk/typescript/src/verify.ts";
const result = verifyBundle(bundle, keySetFromDocument(keys));
console.log(result.ok, result.status);
```

The cases in `spec/test-vectors/receipts.json` are ready made inputs to try.
