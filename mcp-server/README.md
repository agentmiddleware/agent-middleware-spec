# Receipt verifier MCP server

I built this so your agent can check an Agent Middleware receipt on your own machine. You pass the receipt and the key set. There is no account and no network call.

The server speaks MCP over stdin and stdout. It uses the TypeScript verifier at `sdk/typescript/src/verify.ts`. It does not contain a second copy of that logic.

## Install

You need Node 22.18 or later.

```bash
cd mcp-server
npm install
npm run build
```

## Usage

Start the server from this directory after the build:

```bash
node bin/amw-verify-receipt-mcp.js
```

An MCP client that installs the package by name uses:

```bash
npx -p @agentmiddleware/verify-receipt-mcp amw-verify-receipt-mcp
```

This repository does not publish the package. The `npx` command is the one to use once the package is on a registry.

Two tools are registered.

`verify_receipt` takes `bundle`, `keys`, and an optional `expected` object. `expected` may include `issuer`, `receipt_id`, `permit_id`, and `tool`. When the signature holds and one of those fields disagrees with the signed claims, the status is `mismatch`. A bad signature comes back as `invalid` with `accept` `reject`. That is a normal result. `unknown_key`, `malformed`, and `unsupported` come back as `cannot_judge`.

`inspect_receipt` takes `bundle` and shows the signed payload. `trusted` is false. The text starts with `UNVERIFIED`. When the outcome is `delivery_uncertain`, the debit is kept, the gateway does not resend on its own, and an operator must reconcile.

Logs, if any, go to stderr. Nothing else is written to stdout except MCP frames.

## Tests

```bash
npm run build
npm test
```

The tests run `spec/test-vectors` through both tools.

## License

Apache 2.0. See the repository `LICENSE`.
