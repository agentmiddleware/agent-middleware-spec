import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import {
  INSPECT_TOOL_DESCRIPTION,
  VERIFY_TOOL_DESCRIPTION,
  acceptFor,
  inspectReceipt,
  inspectSummary,
  verifyReceipt,
  verifySummary,
} from "../src/receipt-tools.ts";

const vectors = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "spec", "test-vectors");
const keysDoc = JSON.parse(readFileSync(join(vectors, "keys.json"), "utf8"));
const { cases } = JSON.parse(readFileSync(join(vectors, "receipts.json"), "utf8"));

const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = (() => {
  fetchCalls += 1;
  throw new Error("network disabled");
}) as typeof fetch;

for (const c of cases) {
  test(`verify_receipt ${c.name}`, () => {
    const keys = c.keys ?? keysDoc;
    const result = verifyReceipt({ bundle: c.bundle, keys });
    assert.equal(result.status, c.expect);
    assert.equal(result.ok, c.expect === "verified");
    assert.equal(result.accept, acceptFor(c.expect));
    assert.equal(verifySummary(result).toLowerCase().includes(["exactly", "once"].join(" ")), false);
  });

  test(`inspect_receipt ${c.name}`, () => {
    const result = inspectReceipt(c.bundle);
    assert.equal(result.trusted, false);
    assert.equal("status" in result, false);
    const text = inspectSummary(result);
    assert.equal(text.startsWith("UNVERIFIED"), true);
    assert.equal(JSON.stringify(result).includes('"status":"verified"'), false);
  });
}

test("a key set object without a keys list is malformed", () => {
  const valid = cases.find((c: { expect: string }) => c.expect === "verified");
  const result = verifyReceipt({ bundle: valid.bundle, keys: {} });
  assert.equal(result.status, "malformed");
  assert.equal(result.accept, "cannot_judge");
  assert.equal(result.ok, false);
});

test("disabled key is dropped before verification", () => {
  const disabled = structuredClone(keysDoc);
  disabled.keys[0].status = "disabled";
  const valid = cases.find((c: { expect: string }) => c.expect === "verified");
  const result = verifyReceipt({ bundle: valid.bundle, keys: disabled });
  assert.equal(result.status, "unknown_key");
  assert.equal(result.accept, "cannot_judge");
});

test("expected claim fields downgrade a verified receipt to mismatch", () => {
  const valid = cases.find((c: { expect: string }) => c.expect === "verified");
  const claims = verifyReceipt({ bundle: valid.bundle, keys: keysDoc });
  assert.equal(claims.status, "verified");

  const wrong = verifyReceipt({
    bundle: valid.bundle,
    keys: keysDoc,
    expected: {
      receipt_id: "rcpt_other",
      permit_id: "pmt_other",
      tool: "other-tool",
    },
  });
  assert.equal(wrong.status, "mismatch");
  assert.equal(wrong.accept, "reject");
  assert.equal(wrong.ok, false);
  assert.match(wrong.reason ?? "", /receipt_id/);
  assert.match(wrong.reason ?? "", /permit_id/);
  assert.match(wrong.reason ?? "", /tool/);

  const same = verifyReceipt({
    bundle: valid.bundle,
    keys: keysDoc,
    expected: {
      receipt_id: claims.receipt_id,
      permit_id: String(claims.claims?.permit_id),
      tool: String(claims.claims?.tool),
    },
  });
  assert.equal(same.status, "verified");
  assert.equal(same.accept, "yes");
});

test("expected issuer is passed to the verifier", () => {
  const valid = cases.find((c: { expect: string }) => c.expect === "verified");
  const bundle = { ...valid.bundle, issuer: "https://keys.example" };
  const match = verifyReceipt({
    bundle,
    keys: keysDoc,
    expected: { issuer: "https://keys.example" },
  });
  assert.equal(match.status, "verified");
  const miss = verifyReceipt({
    bundle,
    keys: keysDoc,
    expected: { issuer: "https://other.example" },
  });
  assert.equal(miss.status, "mismatch");
  assert.match(miss.reason ?? "", /issuer/);
  assert.equal(miss.accept, "reject");
});

test("unsupported algorithm maps to cannot_judge", () => {
  const valid = cases.find((c: { expect: string }) => c.expect === "verified");
  const payload = JSON.parse(valid.bundle.signing_input);
  payload.alg = "Rot13";
  const bundle = { ...valid.bundle, signing_input: JSON.stringify(payload), alg: "Rot13" };
  const result = verifyReceipt({ bundle, keys: keysDoc });
  assert.equal(result.status, "unsupported");
  assert.equal(result.accept, "cannot_judge");
});

test("delivery_uncertain summaries name the debit and the operator", () => {
  const verified = verifySummary({
    status: "verified",
    ok: true,
    accept: "yes",
    outcome: "delivery_uncertain",
    receipt_id: "rcpt_demo",
  });
  assert.match(verified, /debit is kept/);
  assert.match(verified, /does not resend on its own/);
  assert.match(verified, /operator must reconcile/);

  const inspected = inspectReceipt({
    kid: "sk_golden_0001",
    signing_input: JSON.stringify({
      kid: "sk_golden_0001",
      alg: "Ed25519",
      receipt_id: "rcpt_demo",
      outcome: "delivery_uncertain",
    }),
  });
  assert.equal(inspected.trusted, false);
  assert.match(inspected.outcome_meaning ?? "", /charge stands/);
  const text = inspectSummary(inspected);
  assert.equal(text.startsWith("UNVERIFIED"), true);
  assert.match(text, /operator must reconcile/);
});

test("envelope receipt_id disagreement is visible without trust", () => {
  const mismatch = cases.find((c: { name: string }) => c.name.endsWith("envelope_receipt_id_mismatch"));
  const result = inspectReceipt(mismatch.bundle);
  assert.equal(result.parsed, true);
  assert.equal(result.trusted, false);
  assert.ok(result.envelope_disagreements.some((line) => line.includes("receipt_id")));
});

test("readme prose avoids dash punctuation and the forbidden claim", () => {
  const readme = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "README.md"), "utf8");
  const prose = readme.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
  assert.equal(prose.toLowerCase().includes(["exactly", "once"].join(" ")), false);
  assert.equal(prose.includes("—"), false);
  assert.equal(prose.includes("–"), false);
  assert.equal(prose.includes(" - "), false);
});

test("tool text avoids the forbidden claim", () => {
  const forbidden = ["exactly", "once"].join(" ");
  assert.equal(VERIFY_TOOL_DESCRIPTION.toLowerCase().includes(forbidden), false);
  assert.equal(INSPECT_TOOL_DESCRIPTION.toLowerCase().includes(forbidden), false);
  assert.equal(VERIFY_TOOL_DESCRIPTION.includes("—"), false);
  assert.equal(INSPECT_TOOL_DESCRIPTION.includes("—"), false);
});

test("tool calls do not touch the network", () => {
  assert.equal(fetchCalls, 0);
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
  for (const name of ["server.ts", "receipt-tools.ts"]) {
    const source = readFileSync(join(root, name), "utf8");
    assert.doesNotMatch(source, /node:(net|http|https|dns|tls)/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
  }
});

after(() => {
  globalThis.fetch = originalFetch;
});
