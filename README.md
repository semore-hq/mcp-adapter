# @semore/mcp-adapter

[![CI](https://github.com/semore-hq/mcp-adapter/actions/workflows/ci.yml/badge.svg)](https://github.com/semore-hq/mcp-adapter/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![npm](https://img.shields.io/npm/v/@semore/mcp-adapter.svg)](https://www.npmjs.com/package/@semore/mcp-adapter)
[![status](https://img.shields.io/badge/status-skeleton--v0-lightgrey.svg)](./CHANGELOG.md)

Adapter helpers for the **Model Context Protocol (MCP)** — Anthropic's
JSON-RPC 2.0 protocol for connecting AI agents to external tools and
resources. This package is a thin client wrapper around the externally
exposed Semore MCP surface at `mcp.semore.net`, plus reusable shapes for
building your own MCP server.

> **Source of Truth:** this directory in the Semore monorepo until repo split.
> The production MCP server lives in the internal Semore API at
> `apps/api/src/routes/mcp.ts`. This package exposes the stable, framework-
> agnostic contract for third-party agents and orchestrators.
>
> **Standards-body posture [LEGAL-PENDING]:** References to the Model Context
> Protocol are nominative fair use. Semore claims no endorsement by,
> affiliation with, or co-authorship of Anthropic. Any co-branded integration
> is **(proposed, subject to joint agreement)** with the respective body.
> [EXTERNAL-ADVISORY]

## Install

```bash
npm install @semore/mcp-adapter
# or
pnpm add @semore/mcp-adapter
```

## The 5 Semore tools

The Semore MCP server advertises exactly five tools, mirroring the
agentic-commerce primitive surface:

| Tool             | Purpose                                                       |
| ---------------- | ------------------------------------------------------------- |
| `search_product` | Catalog search — k-beauty / k-fashion / electronics           |
| `get_product`    | Fetch a product by SKU id                                     |
| `create_cart`    | Build a cart from a list of `{ skuId, qty }` items            |
| `quote_checkout` | Compute landed price (duty + tax + shipping) for a country    |
| `submit_intent`  | Submit an AP2 intent mandate to begin the agentic flow        |

## Usage

```ts
import { McpAdapter, type JsonRpcRequest } from "@semore/mcp-adapter";

const adapter = new McpAdapter({
  endpoint: "https://mcp.semore.net",
  // Optional: intercept JSON-RPC for tests by passing your own fetch
  // transport: globalThis.fetch,
});

const tools = await adapter.listTools();
console.log(tools.map((t) => t.name)); // 5 entries

const result = await adapter.callTool("search_product", {
  query: "Korean sunscreen",
  country: "US",
});
```

### Routing inbound JSON-RPC (server side)

```ts
import { McpAdapter } from "@semore/mcp-adapter";

const adapter = new McpAdapter({ endpoint: "https://mcp.semore.net" });

adapter.registerHandler("search_product", async (args) => {
  // your implementation
  return { products: [] };
});

const response = await adapter.handleJsonRpc({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: { name: "search_product", arguments: { query: "sunscreen" } },
});
```

## What this package provides

- `McpAdapter` class — JSON-RPC 2.0 wrapper for the Semore MCP server.
- `listTools()` — fetch the 5-tool advertisement.
- `callTool(name, args)` — invoke a tool over the wire.
- `handleJsonRpc(req)` — dispatcher for inbound requests when you mount your
  own MCP server in front of `@semore/mcp-adapter`.
- Public types: `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcError`,
  `ToolDefinition`, `ToolCall`, `McpAdapterOptions`.

## What this package does **not** provide

- The Semore production MCP server. Tool implementations live behind
  `mcp.semore.net` and are not open-sourced.
- Authentication. Wrap calls in your own bearer-token / mTLS layer if needed.
- Streaming responses. The MCP spec's progress / notification primitives are
  on the Phase 2 roadmap for this adapter.

## Reference

- MCP spec: <https://modelcontextprotocol.io/>
- Semore DID: `did:web:semore.net`
- Contact: `semore.hq@gmail.com` · GitHub [@semore_hq](https://github.com/semore-hq)

## License

Apache-2.0 — see [LICENSE](./LICENSE). Patent grant per Apache-2.0 §3.

Copyright (c) Semore Founding Team.
