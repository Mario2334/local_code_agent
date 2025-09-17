# Code Agent UI (Detachable)

A lightweight, detachable web UI to interact with the local Mastra-based code agent and its planning workflow.

- API base: http://localhost:4111/api (configurable in the UI)
- Two sections:
  - Code Agent (Planning): runs the `planning` workflow with streaming and async fallback. Shows full step-by-step outputs including command execution results (command, exit code, stdout, stderr, error).
  - Code Chat (codeAgent): streams messages to the code agent. Shows full streamed chunks, reasoning/tool invocations if present in stream, and the final text.
- Observability: fetch recent traces.
- Full logging: every request, response, streamed chunk, and parsing step is logged in the Logs panel.

## Prerequisites
- The Mastra API must be running at http://localhost:4111/api. It’s provided by the local_code_agent server in this repository.
- Ensure CORS is enabled by the API if you open this UI from file:// or a different origin. If you encounter CORS issues, serve the UI over HTTP (see below) or enable CORS on the server.

## Launching the UI
Now available as an Electron desktop app (preferred), while still supporting static use.

1) Electron app (recommended):
   - cd into `agent_ui`
   - Install once: `npm install`
   - Start: `npm start`
   - The Electron window loads `index.html` locally. External links open in your default browser. The API base URL is configurable in the header.

2) Open directly (static):
   - Open `agent_ui/index.html` in your browser.
   - If CORS issues occur, use option 3 below.

3) Serve locally (to avoid CORS):
   - From the `agent_ui` directory, use any static server (examples):
     - Python 3: `python3 -m http.server 8080`
     - Node (if installed): `npx serve -l 8080` (or any static server)
   - Open `http://localhost:8080`.

4) Detachable:
   - Copy the `agent_ui` folder anywhere and open/serve it. Configure the API base URL in the header field.

## Usage
1. At the top, verify the API Base URL (`http://localhost:4111/api`) and click "Ping API".
2. Collapsible Navbar:
   - Use the "Hide Nav" / "Show Nav" button in the header to toggle the sidebar.
   - The UI remembers your preference across reloads.
3. Planning Workflow:
   - Enter a Task and choose Detail.
   - Click "Run (Stream)" to stream the workflow via `/api/workflows/planning/stream`.
   - Watch the Planning Output for real-time events and command outputs.
   - If streaming isn’t supported, click "Run (Async Fallback)". Use the Run ID controls to fetch the run and its execution result.
4. Code Chat:
   - Click "Refresh Agents" to load agents (`GET /api/agents`).
   - Select the agent that matches the code agent (auto-selects “Chat Code Agent” if present) or set an override ID.
   - Enter your message and click "Send" to use `/api/agents/{agentId}/generate`.
   - The Chat Output shows the final assistant response once ready (no streaming).
5. Observability:
   - Click "Fetch Recent Traces" to call `/api/observability/traces`.
6. Logs Panel:
   - Shows detailed steps, including request URLs, payloads, headers, raw streamed chunks, parsed JSON, and errors.

## Endpoints used (from OpenAPI)
- Workflows:
  - `POST /api/workflows/planning/stream` (stream real-time)
  - `POST /api/workflows/planning/start-async` (async fallback)
  - `GET /api/workflows/planning/runs/{runId}`
  - `GET /api/workflows/planning/runs/{runId}/execution-result`
  - Agents:
    - `GET /api/agents` (discover agent IDs)
    - `POST /api/agents/{agentId}/generate` (non-stream chat)
  - System & Observability:
    - `GET /api` (ping)
    - `GET /api/observability/traces`

## Notes
- Reasoning/trace content is rendered exactly as the API streams it. The UI displays both raw chunks and parsed JSON lines to ensure full transparency.
- The Planning Output scans streamed JSON for `commandResults` arrays and prints the shell command, exit code, stdout, stderr, and error fields when available.
- If your API requires authentication headers, extend `app.js` to inject headers in the fetch calls.

## Folder Structure
- `index.html` – UI layout and panels for Planning, Chat, Observability, and Logs.
- `styles.css` – Minimal dark theme styling.
- `app.js` – API interactions, SSE/NDJSON streaming, detailed logging, and UI event handlers.
- `README.md` – This file.

---
If you need additional features (threaded chat history, memory controls, custom model settings), this UI is designed to be easily extended in `app.js`.