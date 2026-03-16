# Project Instructions

This is a Vite + React + TypeScript single-page application that integrates
with the Datarails Finance OS API via the MCP server.

## Tech Stack
- Vite + React 18 + TypeScript
- Single-page app (SPA) deployed to Azure Static Web Apps

## Project Structure
```
index.html
package.json
tsconfig.json
vite.config.ts
src/
  main.tsx
  App.tsx
  App.css
  api.ts          # MCP client + token manager
  vite-env.d.ts
docs/
  openapi.json    # Full OpenAPI spec — READ THIS for all available endpoints
```

## API Integration (src/api.ts)

**IMPORTANT: Read `docs/openapi.json` for the complete API specification.**

The app communicates with the Datarails MCP server using JSON-RPC over HTTP.
The MCP server provides tools that wrap the Finance OS API.

### Configuration (environment variables injected at build time)

The app uses these env vars (available via `import.meta.env`):
- `VITE_MCP_URL` — MCP server endpoint
- `VITE_DR_SESSION_ID` — Django session cookie
- `VITE_DR_CSRF_TOKEN` — Django CSRF token
- `VITE_DR_DOMAIN` — Datarails domain (e.g. app.datarails.com)

### Token Management

The app must exchange session cookies for short-lived JWTs and auto-refresh:

```typescript
class TokenManager {
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(
    private domain: string,
    private sessionId: string,
    private csrfToken: string
  ) {}

  async getToken(): Promise<string> {
    if (!this.accessToken || Date.now() / 1000 >= this.expiresAt - 30) {
      await this.refresh();
    }
    return this.accessToken!;
  }

  private async refresh(): Promise<void> {
    const resp = await fetch(`https://${this.domain}/jwt/api/token/`, {
      method: 'POST',
      headers: { 'X-CSRFToken': this.csrfToken },
      credentials: 'include',
    });
    // Note: if CORS blocks cookie-based auth from the SPA origin,
    // use the MCP server as a proxy instead (it handles auth internally).
    const data = await resp.json();
    this.accessToken = data.access;
    // Decode JWT exp claim
    const payload = JSON.parse(atob(this.accessToken!.split('.')[1]));
    this.expiresAt = payload.exp;
  }
}
```

### Calling MCP Tools (JSON-RPC)

All API interactions go through the MCP server at `VITE_MCP_URL`:

```typescript
async function callMcpTool(toolName: string, args: Record<string, any>): Promise<any> {
  const token = await tokenManager.getToken();
  const response = await fetch(import.meta.env.VITE_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
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
  });
  const data = await response.json();
  return JSON.parse(data.result?.content?.[0]?.text ?? '{}');
}
```

### Available MCP Tools

**Data tools:**
- `list_finance_tables()` — List all tables
- `get_table_schema(table_id)` — Column info
- `get_field_distinct_values(table_id, field_name, limit?)` — Unique values
- `get_sample_records(table_id, n?)` — Random sample
- `get_records_by_filter(table_id, filters, limit?, offset?)` — Filtered records
- `execute_query(table_id, query)` — Custom query
- `aggregate_table_data(table_id, dimensions, metrics, filters?)` — Aggregation

**Profiling tools:**
- `profile_table_summary(table_id)` — Row count, column stats
- `profile_numeric_fields(table_id, fields?)` — Numeric stats
- `profile_categorical_fields(table_id, fields?)` — Categorical stats
- `detect_anomalies(table_id)` — Anomaly detection

**AI Agent:**
- `run_ai_agent(prompt)` — Run an AI agent that can autonomously interact
  with the Finance OS API. Pass a natural-language task and the agent will
  make API calls, analyze data, and return results. Use this for complex
  multi-step tasks like "analyze revenue trends by department for 2025".

## Design & UX

- Professional, modern look — clean typography, good spacing, rounded corners
- Use a nice color palette (blues/grays work well for finance apps)
- Smooth transitions and hover effects
- Loading spinners for async operations
- Keep it simple — single page app, no complex routing
- The app should be in a SINGLE App.tsx file (plus api.ts for API calls)

## Build Requirements

- The app MUST compile and build without errors: `npm run build`
- Fix any TypeScript errors before finishing
- Keep the code simple — avoid complex type gymnastics
- Do NOT write test files — focus on making the app work correctly

## Conventions
- Modern React (hooks, functional components)
- Include loading states and error handling for API calls
- All API calls go through the api.ts wrapper
