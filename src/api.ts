// MCP client — auth is handled server-side via session headers

export async function callMcpTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(import.meta.env.VITE_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': import.meta.env.VITE_DR_SESSION_ID ?? '',
      'X-Csrf-Token': import.meta.env.VITE_DR_CSRF_TOKEN ?? '',
      'X-Domain': import.meta.env.VITE_DR_DOMAIN ?? '',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: args },
      id: Date.now(),
    }),
  })
  const data = await response.json()
  return JSON.parse((data.result?.content?.[0]?.text) ?? '{}')
}
