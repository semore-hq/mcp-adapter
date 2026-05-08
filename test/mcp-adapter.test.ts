import { describe, it, expect } from "vitest";
import { McpAdapter, SEMORE_TOOLS, type JsonRpcRequest } from "../src/index.js";

describe("SEMORE_TOOLS surface", () => {
  it("advertises exactly 5 tools with the expected names", () => {
    expect(SEMORE_TOOLS).toHaveLength(5);
    const names = SEMORE_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(
      ["create_cart", "get_product", "quote_checkout", "search_product", "submit_intent"].sort(),
    );
  });

  it("every tool has an object inputSchema", () => {
    for (const t of SEMORE_TOOLS) {
      expect(t.inputSchema.type).toBe("object");
      expect(typeof t.description).toBe("string");
    }
  });
});

describe("handleJsonRpc — tools/list", () => {
  it("returns the 5-tool advertisement", async () => {
    const adapter = new McpAdapter();
    const res = await adapter.handleJsonRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    expect("result" in res).toBe(true);
    if ("result" in res) {
      const r = res.result as { tools: { name: string }[] };
      expect(r.tools).toHaveLength(5);
    }
  });
});

describe("handleJsonRpc — tools/call", () => {
  it("dispatches to a registered handler", async () => {
    const adapter = new McpAdapter();
    adapter.registerHandler("search_product", async (args) => {
      return { echo: args["query"] };
    });
    const res = await adapter.handleJsonRpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "search_product", arguments: { query: "sunscreen" } },
    });
    expect("result" in res).toBe(true);
    if ("result" in res) {
      expect(res.result).toEqual({ echo: "sunscreen" });
    }
  });

  it("returns -32601 for an unknown tool", async () => {
    const adapter = new McpAdapter();
    const res = await adapter.handleJsonRpc({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "does_not_exist", arguments: {} },
    });
    expect("error" in res).toBe(true);
    if ("error" in res) expect(res.error.code).toBe(-32_601);
  });

  it("returns -32603 (not_implemented) for a known tool with no handler", async () => {
    const adapter = new McpAdapter();
    const res = await adapter.handleJsonRpc({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "submit_intent", arguments: { intentMandateJwt: "x" } },
    });
    expect("error" in res).toBe(true);
    if ("error" in res) {
      expect(res.error.code).toBe(-32_603);
      expect(res.error.message).toMatch(/not_implemented/);
    }
  });

  it("returns -32602 for malformed params", async () => {
    const adapter = new McpAdapter();
    const res = await adapter.handleJsonRpc({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {},
    });
    expect("error" in res).toBe(true);
    if ("error" in res) expect(res.error.code).toBe(-32_602);
  });

  it("returns -32600 for an invalid envelope", async () => {
    const adapter = new McpAdapter();
    const res = await adapter.handleJsonRpc({
      // @ts-expect-error — runtime guard under test
      jsonrpc: "1.0",
      id: 6,
      method: "tools/list",
    });
    expect("error" in res).toBe(true);
    if ("error" in res) expect(res.error.code).toBe(-32_600);
  });

  it("returns -32601 for an unknown method", async () => {
    const adapter = new McpAdapter();
    const res = await adapter.handleJsonRpc({
      jsonrpc: "2.0",
      id: 7,
      method: "resources/list",
    });
    expect("error" in res).toBe(true);
    if ("error" in res) expect(res.error.code).toBe(-32_601);
  });
});

describe("client mode — listTools / callTool", () => {
  function makeFetchStub(replies: Record<string, unknown>): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as JsonRpcRequest;
      const result = replies[body.method];
      void input;
      const responseBody = JSON.stringify({ jsonrpc: "2.0", id: body.id ?? null, result });
      return new Response(responseBody, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
  }

  it("listTools delegates to tools/list", async () => {
    const transport = makeFetchStub({
      "tools/list": { tools: SEMORE_TOOLS },
    });
    const adapter = new McpAdapter({
      endpoint: "https://mcp.example",
      transport,
    });
    const tools = await adapter.listTools();
    expect(tools).toHaveLength(5);
  });

  it("callTool delegates to tools/call and returns the result", async () => {
    const transport = makeFetchStub({
      "tools/call": { products: [{ skuId: "sku_1" }] },
    });
    const adapter = new McpAdapter({
      endpoint: "https://mcp.example",
      transport,
    });
    const result = (await adapter.callTool("search_product", {
      query: "sunscreen",
    })) as { products: { skuId: string }[] };
    expect(result.products[0]?.skuId).toBe("sku_1");
  });

  it("client mode without endpoint throws", async () => {
    const adapter = new McpAdapter();
    await expect(adapter.listTools()).rejects.toThrow(/endpoint/);
  });
});
