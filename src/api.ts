// MCP client + token manager
// See CLAUDE.md for full API integration details

class TokenManager {
  private accessToken: string | null = null
  private expiresAt = 0

  constructor(
    private domain: string,
    private csrfToken: string
  ) {}

  async getToken(): Promise<string> {
    if (!this.accessToken || Date.now() / 1000 >= this.expiresAt - 30) {
      await this.refresh()
    }
    return this.accessToken!
  }

  private async refresh(): Promise<void> {
    const resp = await fetch(`https://${this.domain}/jwt/api/token/`, {
      method: 'POST',
      headers: { 'X-CSRFToken': this.csrfToken },
      credentials: 'include',
    })
    const data = await resp.json()
    this.accessToken = data.access
    const payload = JSON.parse(atob(this.accessToken!.split('.')[1]))
    this.expiresAt = payload.exp
  }
}

const tokenManager = new TokenManager(
  import.meta.env.VITE_DR_DOMAIN ?? '',
  import.meta.env.VITE_DR_CSRF_TOKEN ?? ''
)

export async function callMcpTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const token = await tokenManager.getToken()
  const response = await fetch(import.meta.env.VITE_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Session-Id': import.meta.env.VITE_DR_SESSION_ID,
      'X-Csrf-Token': import.meta.env.VITE_DR_CSRF_TOKEN,
      'X-Domain': import.meta.env.VITE_DR_DOMAIN,
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
