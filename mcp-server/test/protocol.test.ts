import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = dirname(fileURLToPath(import.meta.url));
const vectors = join(here, "..", "..", "spec", "test-vectors");
const keysDoc = JSON.parse(readFileSync(join(vectors, "keys.json"), "utf8"));
const { cases } = JSON.parse(readFileSync(join(vectors, "receipts.json"), "utf8"));

function childEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.env.PATH) env.PATH = process.env.PATH;
  return env;
}

async function withClient(run: (client: Client) => Promise<void>): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(here, "..", "bin", "amw-verify-receipt-mcp.js")],
    cwd: join(here, ".."),
    env: childEnv(),
    stderr: "pipe",
  });
  const client = new Client({ name: "verify-receipt-test", version: "0.1.0" });
  await client.connect(transport);
  try {
    await run(client);
  } finally {
    await client.close();
  }
}

test("stdio lists both tools and runs the shared vectors", async () => {
  await withClient(async (client) => {
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, ["inspect_receipt", "verify_receipt"]);

    for (const c of cases) {
      const verified = await client.callTool({
        name: "verify_receipt",
        arguments: { bundle: c.bundle, keys: c.keys ?? keysDoc },
      });
      assert.notEqual(verified.isError, true);
      const body = verified.structuredContent as { status?: string; accept?: string };
      assert.equal(body.status, c.expect);

      const inspected = await client.callTool({
        name: "inspect_receipt",
        arguments: { bundle: c.bundle },
      });
      assert.notEqual(inspected.isError, true);
      const shown = inspected.structuredContent as { trusted?: boolean };
      assert.equal(shown.trusted, false);
      const text = inspected.content as Array<{ text?: string }>;
      assert.equal(text[0]?.text?.startsWith("UNVERIFIED"), true);
    }
  });
});

test("a bad signature is invalid and not an MCP error", async () => {
  const bad = cases.find((c: { name: string }) => c.name.endsWith("bad_signature"));
  await withClient(async (client) => {
    const result = await client.callTool({
      name: "verify_receipt",
      arguments: { bundle: bad.bundle, keys: keysDoc },
    });
    assert.notEqual(result.isError, true);
    const body = result.structuredContent as { status?: string; accept?: string };
    assert.equal(body.status, "invalid");
    assert.equal(body.accept, "reject");
  });
});

test("schema violations are MCP errors", async () => {
  const valid = cases.find((c: { expect: string }) => c.expect === "verified");
  await withClient(async (client) => {
    const extra = await client.callTool({
      name: "verify_receipt",
      arguments: { bundle: valid.bundle, keys: keysDoc, extra: true },
    });
    assert.equal(extra.isError, true);

    const missing = await client.callTool({
      name: "inspect_receipt",
      arguments: {},
    });
    assert.equal(missing.isError, true);
  });
});
