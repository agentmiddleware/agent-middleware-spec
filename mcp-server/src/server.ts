/**
 * Offline MCP server for Agent Middleware receipt checks.
 * stdio only. Logs go to stderr. No network and no environment secrets.
 *
 * Licensed under Apache-2.0.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  INSPECT_TOOL_DESCRIPTION,
  VERIFY_TOOL_DESCRIPTION,
  inspectReceipt,
  inspectSummary,
  verifyReceipt,
  verifySummary,
} from "./receipt-tools.ts";

const bundleSchema = z
  .object({})
  .passthrough()
  .describe("Portable receipt bundle per spec/receipt-v0.1.md");
const keysSchema = z
  .object({})
  .passthrough()
  .describe("Key set document per spec/key-set-v0.1.md (the trust-keys.json body)");
const expectedSchema = z
  .object({
    issuer: z.string().optional(),
    receipt_id: z.string().optional(),
    permit_id: z.string().optional(),
    tool: z.string().optional(),
  })
  .strict()
  .describe("Optional caller expectations. Any disagreement with signed claims yields mismatch.");

const verifyOutputSchema = {
  status: z.enum(["verified", "invalid", "mismatch", "unknown_key", "malformed", "unsupported"]),
  ok: z.boolean(),
  accept: z.enum(["yes", "reject", "cannot_judge"]),
  reason: z.string().optional(),
  receipt_id: z.string().optional(),
  kid: z.string().optional(),
  outcome: z.string().optional(),
  claims: z.record(z.unknown()).optional(),
};

const inspectOutputSchema = {
  parsed: z.boolean(),
  trusted: z.literal(false),
  kid: z.string().optional(),
  alg: z.string().optional(),
  canonicalization: z.string().optional(),
  claims: z.record(z.unknown()).optional(),
  outcome_meaning: z.string().optional(),
  envelope_disagreements: z.array(z.string()),
};

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function createServer(): McpServer {
  const server = new McpServer({
    name: "io.github.agentmiddleware/agent-middleware-spec",
    version: "0.1.0",
  });

  server.registerTool(
    "verify_receipt",
    {
      description: VERIFY_TOOL_DESCRIPTION,
      inputSchema: z
        .object({
          bundle: bundleSchema,
          keys: keysSchema,
          expected: expectedSchema.optional(),
        })
        .strict(),
      outputSchema: verifyOutputSchema,
      annotations: readOnly,
    },
    async (input) => {
      const structured = verifyReceipt(input);
      const structuredContent: Record<string, unknown> = { ...structured };
      return {
        content: [{ type: "text", text: verifySummary(structured) }],
        structuredContent,
      };
    },
  );

  server.registerTool(
    "inspect_receipt",
    {
      description: INSPECT_TOOL_DESCRIPTION,
      inputSchema: z.object({ bundle: bundleSchema }).strict(),
      outputSchema: inspectOutputSchema,
      annotations: readOnly,
    },
    async (input) => {
      const structured = inspectReceipt(input.bundle);
      const structuredContent: Record<string, unknown> = { ...structured };
      return {
        content: [{ type: "text", text: inspectSummary(structured) }],
        structuredContent,
      };
    },
  );

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
