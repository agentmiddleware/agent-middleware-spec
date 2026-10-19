/**
 * Tool behavior for the offline receipt MCP server.
 * Verification is delegated to sdk/typescript/src/verify.ts.
 *
 * Licensed under Apache-2.0.
 */
import {
  CANONICALIZATION,
  keySetFromDocument,
  verifyBundle,
  type VerificationResult,
  type VerificationStatus,
} from "../../sdk/typescript/src/verify.ts";

export const VERIFY_TOOL_DESCRIPTION =
  "Check a portable receipt bundle against a key set you supply. The check is offline and makes no network call. Optional expected fields are issuer, receipt_id, permit_id, and tool. A disagreement with the signed claims returns mismatch. A bad signature returns invalid and is a normal result, not a protocol error. verified means accept yes. invalid and mismatch mean accept reject. unknown_key, malformed, and unsupported mean accept cannot_judge.";

export const INSPECT_TOOL_DESCRIPTION =
  "Read a receipt bundle and show the signed payload without trusting it. trusted is always false. The text starts with UNVERIFIED. Use this before you have keys. When the outcome is delivery_uncertain, the debit is kept, the gateway does not resend on its own, and an operator must reconcile.";

const DELIVERY_UNCERTAIN_SUMMARY =
  "The debit is kept, the gateway does not resend on its own, and an operator must reconcile.";

const OUTCOME_MEANING: Record<string, string> = {
  success: "The tool returned a valid result; charged",
  denied: "Refused before any money moved (permit, policy, approval); not charged",
  insufficient_funds: "The charge itself was refused; not charged",
  failed_refunded: "Confirmed failure; the debit was refunded",
  failed_unrefunded: "A refund was owed and was not completed",
  delivery_uncertain: "The call was dispatched but no trustworthy result came back; the charge stands",
  response_rejected: "The downstream responded with something unusable",
};

export interface ExpectedClaims {
  issuer?: string;
  receipt_id?: string;
  permit_id?: string;
  tool?: string;
}

export interface VerifyToolResult {
  status: VerificationStatus;
  ok: boolean;
  accept: "yes" | "reject" | "cannot_judge";
  reason?: string;
  receipt_id?: string;
  kid?: string;
  outcome?: string;
  claims?: Record<string, unknown>;
}

export interface InspectToolResult {
  parsed: boolean;
  trusted: false;
  kid?: string;
  alg?: string;
  canonicalization?: string;
  claims?: Record<string, unknown>;
  outcome_meaning?: string;
  envelope_disagreements: string[];
}

const CLAIM_FIELDS = ["receipt_id", "permit_id", "tool"] as const;

export function acceptFor(status: VerificationStatus): VerifyToolResult["accept"] {
  if (status === "verified") return "yes";
  if (status === "invalid" || status === "mismatch") return "reject";
  return "cannot_judge";
}

function fromVerification(result: VerificationResult): VerifyToolResult {
  const claims = result.claims;
  const outcome = claims && typeof claims.outcome === "string" ? claims.outcome : undefined;
  const out: VerifyToolResult = {
    status: result.status,
    ok: result.ok,
    accept: acceptFor(result.status),
  };
  if (result.reason) out.reason = result.reason;
  if (result.receiptId) out.receipt_id = result.receiptId;
  if (result.keyId) out.kid = result.keyId;
  if (outcome) out.outcome = outcome;
  if (claims) out.claims = claims;
  return out;
}

export function verifyReceipt(input: {
  bundle: unknown;
  keys: unknown;
  expected?: ExpectedClaims;
}): VerifyToolResult {
  let keySet;
  try {
    keySet = keySetFromDocument(input.keys);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "key set document is not usable";
    return { status: "malformed", ok: false, accept: "cannot_judge", reason };
  }

  const verified = verifyBundle(input.bundle, keySet, input.expected?.issuer);
  if (verified.status !== "verified" || !verified.claims || !input.expected) {
    return fromVerification(verified);
  }

  const mismatches = CLAIM_FIELDS.filter((field) => {
    const want = input.expected?.[field];
    return want !== undefined && verified.claims?.[field] !== want;
  });
  if (mismatches.length === 0) return fromVerification(verified);

  return fromVerification({
    status: "mismatch",
    ok: false,
    reason: mismatches.map((field) => `${field} mismatch`).join("; "),
    receiptId: verified.receiptId,
    keyId: verified.keyId,
    claims: verified.claims,
  });
}

export function verifySummary(result: VerifyToolResult): string {
  const bits = [`${result.status}`, `accept ${result.accept}`];
  if (result.receipt_id) bits.push(`receipt_id ${result.receipt_id}`);
  if (result.outcome) bits.push(`outcome ${result.outcome}`);
  if (result.reason) bits.push(result.reason);
  let line = bits.join(". ");
  if (result.status === "verified" && result.outcome === "delivery_uncertain") {
    line = `${line}. ${DELIVERY_UNCERTAIN_SUMMARY}`;
  }
  return line;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function inspectReceipt(bundle: unknown): InspectToolResult {
  const empty: InspectToolResult = { parsed: false, trusted: false, envelope_disagreements: [] };
  const envelope = asRecord(bundle);
  if (!envelope || typeof envelope.signing_input !== "string") return empty;

  let payload: unknown;
  try {
    payload = JSON.parse(envelope.signing_input);
  } catch {
    return empty;
  }
  const claims = asRecord(payload);
  if (!claims) return empty;

  const signedAlg = typeof claims.alg === "string" ? claims.alg : "Ed25519";
  const signedCanon = typeof claims.canonicalization === "string" ? claims.canonicalization : CANONICALIZATION;
  const disagreements: string[] = [];
  if (typeof claims.kid === "string" && typeof envelope.kid === "string" && envelope.kid !== claims.kid) {
    disagreements.push("kid differs from the signed payload");
  }
  if (envelope.alg !== undefined && envelope.alg !== signedAlg) {
    disagreements.push("alg differs from the signed payload");
  }
  if (envelope.canonicalization !== undefined && envelope.canonicalization !== signedCanon) {
    disagreements.push("canonicalization differs from the signed payload");
  }
  if (envelope.receipt_id !== undefined && envelope.receipt_id !== claims.receipt_id) {
    disagreements.push("receipt_id differs from the signed payload");
  }

  const outcome = typeof claims.outcome === "string" ? claims.outcome : undefined;
  const result: InspectToolResult = {
    parsed: true,
    trusted: false,
    alg: signedAlg,
    canonicalization: signedCanon,
    claims,
    envelope_disagreements: disagreements,
  };
  if (typeof claims.kid === "string") result.kid = claims.kid;
  if (outcome) {
    result.outcome_meaning = OUTCOME_MEANING[outcome] ?? "This outcome is not listed in the v0.1 outcomes table.";
  }
  return result;
}

export function inspectSummary(result: InspectToolResult): string {
  const bits = ["UNVERIFIED"];
  bits.push(result.parsed ? "parsed yes" : "parsed no");
  if (result.kid) bits.push(`kid ${result.kid}`);
  const outcome = result.claims && typeof result.claims.outcome === "string" ? result.claims.outcome : undefined;
  if (outcome) bits.push(`outcome ${outcome}`);
  if (result.outcome_meaning) bits.push(result.outcome_meaning);
  if (result.envelope_disagreements.length > 0) {
    bits.push(`envelope disagreements: ${result.envelope_disagreements.join(", ")}`);
  }
  let line = bits.join(". ");
  if (outcome === "delivery_uncertain") line = `${line}. ${DELIVERY_UNCERTAIN_SUMMARY}`;
  return line;
}
