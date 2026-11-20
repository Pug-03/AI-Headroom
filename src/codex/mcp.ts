import { createInterface } from "node:readline";
import { fromStatuslineState } from "../adapters/codex.ts";
import { layoutFor, loadConfig } from "../core/config.ts";
import { layout } from "../core/layout.ts";
import { renderCodexTree } from "../render/codexTree.ts";

/**
 * Minimal MCP (newline-delimited JSON-RPC over stdio) server that provides a
 * Codex footer. Protocol per the `create-statusline` skill bundled with Codex:
 * one tool advertising a `statusline` entrypoint, and a resource that Codex
 * re-reads about once a second, passing thread state in `_meta`.
 */
export const URI = "ui://termbar/footer";
const STATE_KEY = "com.openai/codex-statusline-state";

const TOOL = {
  name: "statusline",
  title: "termbar",
  description: "Model, context usage and rate limits as a colored footer.",
  inputSchema: { type: "object", properties: {} },
  _meta: { "openai/ui": { entrypoints: [{ type: "statusline", resourceUri: URI }] } },
};

type Params = Record<string, unknown>;

class RpcError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export function handleRequest(method: string, params: Params = {}): unknown {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "termbar", version: "0.1.0" },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: [TOOL] };
    case "tools/call":
      if (params.name !== TOOL.name) throw new RpcError(-32602, "Unknown tool name");
      return { content: [{ type: "text", text: `The statusline resource is ${URI}.` }] };
    case "resources/list":
      return { resources: [{ name: "footer", uri: URI, mimeType: "application/json" }] };
    case "resources/templates/list":
      return { resourceTemplates: [] };
    case "resources/read": {
      if (params.uri !== URI) throw new RpcError(-32602, "Unknown resource URI");
      const meta = (params._meta ?? {}) as Params;
      const snap = fromStatuslineState(meta[STATE_KEY]);
      // Config is re-read on every poll (~1/s), so edits show up without a restart.
      const lo = layoutFor(loadConfig(), "codex");
      const tree = snap ? renderCodexTree(layout(snap, lo), { separator: lo.separator }) : null;
      return { contents: [{ uri: URI, mimeType: "application/json", text: JSON.stringify(tree) }] };
    }
    default:
      throw new RpcError(-32601, "Method not found");
  }
}

export function serveStdio(): void {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    const reply: Record<string, unknown> = { jsonrpc: "2.0", id: null };
    try {
      const req = JSON.parse(line) as Record<string, unknown>;
      if (typeof req !== "object" || req === null || typeof req.method !== "string") {
        throw new RpcError(-32600, "Invalid request");
      }
      if (!("id" in req)) return; // notification
      reply.id = req.id;
      reply.result = handleRequest(req.method, (req.params ?? {}) as Params);
    } catch (e) {
      reply.error =
        e instanceof RpcError
          ? { code: e.code, message: e.message }
          : e instanceof SyntaxError
            ? { code: -32700, message: "Parse error" }
            : { code: -32603, message: "Internal error" };
      delete reply.result;
    }
    process.stdout.write(`${JSON.stringify(reply)}\n`);
  });
}
