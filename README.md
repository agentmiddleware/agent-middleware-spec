> This repository is archived and no longer maintained.
> Development continues at [agentmiddleware/agent-middleware](https://github.com/agentmiddleware/agent-middleware).
> Product site: [agentmiddleware.dev](https://agentmiddleware.dev).
> Apache 2.0 (gateway is Fair Source, FSL-1.1)

# Agent Middleware Spec

I built this repo so anyone can check an Agent Middleware receipt on their own machine. You need no account, no network call and no trust in me.

It holds five things:

* `spec/` has the permit, receipt and key set formats (v0.1) plus shared test vectors.
* `verifier/` runs every test vector against the Python reference verifier.
* `sdk/python/` is the offline receipt verifier and the `b2a-verify-receipt` CLI.
* `sdk/typescript/` is a second, independent verifier built on Node's own Ed25519.
* `mcp-server/` is an MCP server over stdin and stdout. It calls that TypeScript verifier. The tools are `verify_receipt` and `inspect_receipt`.

## Quick start

```bash
pip install -e "./sdk/python[verify]"
python verifier/check_vectors.py
(cd sdk/typescript && npm test)
```

Usage examples live in `examples/`.

## License

Apache 2.0. See `LICENSE`.

Found a bug in the spec or a verifier? Open an issue.
