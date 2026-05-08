// MCP transport schema — JSON-RPC 2.0 + MCP tool primitives.
// Full server shape lives at apps/api/src/routes/mcp.ts in the Semore monorepo.

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest<TParams = unknown> {
  readonly jsonrpc: "2.0";
  readonly id?: JsonRpcId;
  readonly method: string;
  readonly params?: TParams;
}

export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export type JsonRpcResponse<TResult = unknown> =
  | {
      readonly jsonrpc: "2.0";
      readonly id: JsonRpcId;
      readonly result: TResult;
    }
  | {
      readonly jsonrpc: "2.0";
      readonly id: JsonRpcId;
      readonly error: JsonRpcError;
    };

/**
 * MCP `tools/call` params. The `name` selects the tool; `arguments` is the
 * tool-specific payload validated against the tool's `inputSchema`.
 */
export interface ToolCall {
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

/**
 * Minimal JSON Schema description used in MCP tool advertisements.
 * The MCP spec accepts the full JSON-Schema-2020-12 draft; we only type the
 * common subset needed by the Semore 5-tool surface.
 */
export interface ToolInputSchema {
  readonly type: "object";
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly [k: string]: unknown;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ToolInputSchema;
}

export type ToolHandler = (
  args: Readonly<Record<string, unknown>>,
) => Promise<unknown> | unknown;

export interface McpAdapterOptions {
  /**
   * Base URL of the upstream MCP server. The adapter POSTs JSON-RPC requests
   * to `${endpoint}` (no path appended). Required for client-mode usage —
   * pure server-mode usage (`registerHandler` + `handleJsonRpc`) does not
   * need to reach the network.
   */
  readonly endpoint?: string;
  /**
   * Optional fetch transport. Defaults to `globalThis.fetch`. Useful in tests
   * to inject a mock without monkey-patching globals.
   */
  readonly transport?: typeof fetch;
  /**
   * Optional auth header value. When set, attached as `Authorization` on
   * every outbound request.
   */
  readonly authorization?: string;
  /**
   * Optional override of the advertised tool surface. Defaults to the Semore
   * 5-tool surface. Provide your own list to mount a different MCP server.
   */
  readonly tools?: readonly ToolDefinition[];
}

export type McpErrorCode =
  | -32_700 // parse error
  | -32_600 // invalid request
  | -32_601 // method not found
  | -32_602 // invalid params
  | -32_603; // internal error
