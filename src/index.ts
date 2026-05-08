// @semore/mcp-adapter — public entrypoint.
// JSON-RPC 2.0 client + server scaffold for the Semore agentic-commerce
// 5-tool MCP surface. Real tool implementations live behind mcp.semore.net.

export type {
  JsonRpcError,
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
  McpAdapterOptions,
  McpErrorCode,
  ToolCall,
  ToolDefinition,
  ToolHandler,
  ToolInputSchema,
} from "./types.js";

import type {
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
  McpAdapterOptions,
  ToolDefinition,
  ToolHandler,
} from "./types.js";

/**
 * The Semore agentic-commerce MCP surface. Exactly 5 tools, advertised over
 * `tools/list`. Implementations live behind `mcp.semore.net`.
 */
export const SEMORE_TOOLS: readonly ToolDefinition[] = [
  {
    name: "search_product",
    description: "Search the Semore catalog (k-beauty / k-fashion / electronics).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text query, en/ja/de/fr/es/ko" },
        country: { type: "string", description: "ISO-3166 alpha-2 destination" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_product",
    description: "Fetch a product by Semore SKU id.",
    inputSchema: {
      type: "object",
      properties: {
        skuId: { type: "string", description: "Semore SKU id (e.g. sku_abc123)" },
      },
      required: ["skuId"],
      additionalProperties: false,
    },
  },
  {
    name: "create_cart",
    description: "Build a cart from a list of items.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              skuId: { type: "string" },
              qty: { type: "integer", minimum: 1 },
            },
            required: ["skuId", "qty"],
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
  {
    name: "quote_checkout",
    description: "Compute landed price (duty + tax + shipping) for a country.",
    inputSchema: {
      type: "object",
      properties: {
        cartId: { type: "string" },
        country: { type: "string", description: "ISO-3166 alpha-2 destination" },
      },
      required: ["cartId", "country"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_intent",
    description: "Submit an AP2 intent mandate to begin the agentic flow.",
    inputSchema: {
      type: "object",
      properties: {
        intentMandateJwt: { type: "string", description: "AP2 IntentMandate JWT" },
      },
      required: ["intentMandateJwt"],
      additionalProperties: false,
    },
  },
] as const;

/**
 * `McpAdapter` is a thin wrapper around the JSON-RPC 2.0 surface published by
 * the Semore MCP server. It can also act as the dispatcher inside a server
 * you mount yourself — register handlers via `registerHandler` and route
 * inbound requests through `handleJsonRpc`.
 */
export class McpAdapter {
  readonly #endpoint: string | undefined;
  readonly #fetch: typeof fetch;
  readonly #authorization: string | undefined;
  readonly #tools: readonly ToolDefinition[];
  readonly #handlers = new Map<string, ToolHandler>();
  #reqId = 0;

  constructor(options: McpAdapterOptions = {}) {
    this.#endpoint = options.endpoint;
    const fallback = (globalThis as { fetch?: typeof fetch }).fetch;
    if (!options.transport && !fallback) {
      // Defer the error to call time so server-only consumers can still
      // construct the adapter in environments without a global `fetch`.
    }
    this.#fetch = options.transport ?? (fallback as typeof fetch);
    this.#authorization = options.authorization;
    this.#tools = options.tools ?? SEMORE_TOOLS;
  }

  /**
   * Register a server-side handler for a tool. Used in conjunction with
   * `handleJsonRpc` when you want to mount your own MCP server.
   */
  registerHandler(name: string, handler: ToolHandler): void {
    if (!name) throw new Error("McpAdapter.registerHandler: name is required");
    this.#handlers.set(name, handler);
  }

  /**
   * Snapshot of the advertised tool surface.
   */
  describeTools(): readonly ToolDefinition[] {
    return [...this.#tools];
  }

  // ---------- Client mode (outbound JSON-RPC) ----------

  /**
   * Call the upstream MCP server's `tools/list` method.
   */
  async listTools(): Promise<readonly ToolDefinition[]> {
    const res = await this.#rpc<{ tools: readonly ToolDefinition[] }>("tools/list");
    return res.tools;
  }

  /**
   * Call the upstream MCP server's `tools/call` method.
   */
  async callTool(name: string, args: Readonly<Record<string, unknown>> = {}): Promise<unknown> {
    return await this.#rpc("tools/call", { name, arguments: args });
  }

  async #rpc<TResult = unknown>(method: string, params?: unknown): Promise<TResult> {
    if (!this.#endpoint) {
      throw new Error("McpAdapter: endpoint is required for client-mode calls");
    }
    if (!this.#fetch) {
      throw new Error("McpAdapter: no fetch transport available");
    }
    this.#reqId += 1;
    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: this.#reqId,
      method,
      ...(params !== undefined ? { params } : {}),
    };
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (this.#authorization) headers["authorization"] = this.#authorization;
    const httpRes = await this.#fetch(this.#endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(req),
    });
    if (!httpRes.ok) {
      throw new Error(`McpAdapter: upstream HTTP ${httpRes.status}`);
    }
    const body = (await httpRes.json()) as JsonRpcResponse<TResult>;
    if ("error" in body) {
      const err = new Error(`McpAdapter: ${body.error.message}`) as Error & {
        code?: number;
        data?: unknown;
      };
      err.code = body.error.code;
      err.data = body.error.data;
      throw err;
    }
    return body.result;
  }

  // ---------- Server mode (inbound JSON-RPC) ----------

  /**
   * Dispatch an inbound JSON-RPC request. Supports `tools/list` and
   * `tools/call`; everything else returns method-not-found.
   */
  async handleJsonRpc(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    const id = (req.id ?? null) as JsonRpcId;
    if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
      return { jsonrpc: "2.0", id, error: { code: -32_600, message: "Invalid Request" } };
    }
    if (req.method === "tools/list") {
      return { jsonrpc: "2.0", id, result: { tools: [...this.#tools] } };
    }
    if (req.method === "tools/call") {
      const params = req.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
      if (!params || typeof params.name !== "string") {
        return { jsonrpc: "2.0", id, error: { code: -32_602, message: "Invalid params" } };
      }
      const tool = this.#tools.find((t) => t.name === params.name);
      if (!tool) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32_601, message: `Unknown tool: ${params.name}` },
        };
      }
      const handler = this.#handlers.get(params.name);
      if (!handler) {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32_603,
            message: `not_implemented: ${params.name} — register a handler or proxy to mcp.semore.net`,
          },
        };
      }
      try {
        const result = await handler(params.arguments ?? {});
        return { jsonrpc: "2.0", id, result };
      } catch (e) {
        const message = e instanceof Error ? e.message : "internal error";
        return { jsonrpc: "2.0", id, error: { code: -32_603, message } };
      }
    }
    return { jsonrpc: "2.0", id, error: { code: -32_601, message: `Method not found: ${req.method}` } };
  }
}
