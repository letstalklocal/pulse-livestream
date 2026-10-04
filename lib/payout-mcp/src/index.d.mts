import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
export type Identity = {
  environment: "development" | "production";
  accountKey: string;
  operator: {
    id: string;
    name: string;
    role: "maker" | "checker" | "reconciler";
  };
  [key: string]: unknown;
};
export class AdapterError extends Error {
  code: string;
  status: number;
  constructor(code: string, status?: number);
}
export function validCredential(value: unknown): boolean;
export function redact(value: unknown): unknown;
export class PayoutBackendClient {
  constructor(options: {
    origin: string;
    token: string;
    expected?: {
      environment?: string;
      accountKey?: string;
      operatorId?: string;
      role?: string;
    };
    timeoutMs?: number;
    maxResponseBytes?: number;
    fetchImpl?: typeof fetch;
  });
  identity(signal?: AbortSignal): Promise<Identity>;
  request(path: string, data?: unknown, signal?: AbortSignal): Promise<any>;
}
export function createPayoutMcpServer(options: {
  client: PayoutBackendClient;
  identity?: Identity;
  signal?: AbortSignal;
}): Promise<McpServer>;
