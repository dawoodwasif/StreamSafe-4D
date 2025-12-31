# StreamSafe 4D Frontend

This folder contains the **StreamSafe 4D web UI**. It is a React-based dashboard for industrial safety monitoring, navigation across operational views (zones/workers/alerts/analytics), and an AI-powered **Safety Reports** page that can generate summaries and action checklists using **Gemini**.

---

## Tech stack (what’s inside)

- **React + TypeScript** UI
- **Vite** dev/build tooling (environment variables exposed via `VITE_*`)
- **Wouter** for client-side routing
- **@tanstack/react-query** for data fetching/caching (via a shared `queryClient`)
- **shadcn/ui** style component primitives (cards/buttons/sidebar/toasts/tooltips)
- **lucide-react** icons
- A layout with a persistent **sidebar** + top **header** (theme toggle, time, notifications)

---

## App layout & navigation

The UI is structured around `App.tsx`:

- A **SidebarProvider** wraps the app, providing the collapsible sidebar.
- `AppSidebar` renders:
  - Brand/logo area (favicon)
  - Primary navigation links
  - Static “System Status” block
- A sticky top header provides:
  - Sidebar toggle
  - Current time display
  - Theme toggle
  - Notifications button (UI-only badge)

Routing is implemented with **Wouter** via `<Switch>` + `<Route>`. The key routes include:

- `/` → Dashboard
- `/zones` and `/zones/:id` → Zones listing + detail
- `/workers` and `/workers/:id` → Workers listing + detail
- `/alerts` → Alerts
- `/analytics` → Analytics
- `/safety-reports` → Gemini-powered report generation
- `/settings` → Settings

---

## Safety Reports (AI)

The `/safety-reports` page:

- Collects “context” (currently mock incidents/workers/zones in the UI)
- Calls the **Gemini GenerateContent API** directly from the browser
- Parses the plain-text response into three sections:
  1. **Incident explanations** (Markdown rendering enabled)
  2. **Shift summary** (Markdown rendering enabled)
  3. **Recommended action checklist** (structured list per incident)

> Note: Calling Gemini directly from the browser exposes your API key to the client. For production, route this through a backend service.

### Required environment variables (Vite)

Create a `.env` (or `.env.local`) in the **Vite app root** (usually `StreamSafe-frontend/client/`) with:

- `VITE_GEMINI_API_KEY=...`
- `VITE_GEMINI_API_MODEL=gemini-2.5-flash-lite` (or another supported model)

---

## Setup & run (development)

### 1) Install dependencies

From the frontend root (this folder):

```bash
npm install
```

### 2) Start dev server

```bash
npm run dev
```

Vite will print the local URL (commonly `http://localhost:5173`).

> If you updated `.env` or `.env.local`, restart `npm run dev` (Vite loads env at startup).

---

## How to use the UI

### Navigation

- Use the left sidebar to open:
  - Dashboard, Zones, Workers, Alerts, Analytics, Safety Reports, Settings
- The active route is highlighted in the sidebar.

### Safety Reports

1. Open **Safety Reports** from the sidebar.
2. Choose:
   - Time range (Current shift / Last 24h / Last 7d)
   - Severity focus (All / High only)
   - Zone scope (dropdown)
3. Click **Generate report**.
4. Review outputs:
   - **Incident explanations**: per-incident reasoning (Markdown)
   - **Shift summary**: overall narrative and patterns (Markdown)
   - **Action checklist**: actionable steps per incident (structured UI)

---

## Notes on backend integration

This frontend is designed to pair with the backend services (video stream + Kafka):

- Backend MJPEG stream endpoint (commonly): `http://localhost:8823/stream`
- If/when you add a UI “Live Stream” panel, it can embed the MJPEG stream using an `<img src="http://localhost:8823/stream" />`.

For production-grade AI integration, move Gemini calls behind a backend endpoint to avoid exposing the API key.

---

## Troubleshooting

### Safety Reports says “API key missing”

- Ensure your file is in the Vite root:
  - `StreamSafe-frontend/client/.env` (or `.env.local`)
- Ensure the variable is prefixed with `VITE_`:
  - `VITE_GEMINI_API_KEY=...`
- Restart the dev server.

### 404 for a route

- Ensure the route exists in `App.tsx` `<Switch>` and the page component is exported and importable.

---
