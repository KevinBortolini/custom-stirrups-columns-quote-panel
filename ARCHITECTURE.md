# Architecture Notes

## Frontend

The frontend is a Vite-powered single-page application written in vanilla JavaScript.

Primary responsibilities:
- Maintain the current quote state in memory and local storage
- Collect client data and item inputs
- Call calculation endpoints without changing backend formulas
- Present consolidated totals and line-item output
- Manage quote history navigation, reopening, duplication, and deletion requests
- Generate browser print output for PDF export

Main file:
- `frontend/src/main.js`

## Backend

The backend is a FastAPI application composed of small route modules.

- `app/main.py`: app bootstrap and router registration
- `app/rotas/calculos.py`: stirrup and column calculation endpoints and calculation rules
- `app/rotas/orcamentos.py`: quote persistence, history search, retrieval, duplication support, and deletion
- `app/rotas/admin.py`: admin authentication and internal price configuration
- `app/rotas/sistema.py`: health/version endpoints

The calculation logic remains isolated from the UI layer. The portfolio work preserves the original structure instead of rewriting the app around a new architecture.

## Database

SQLite3 is used as the persistence layer.

Main table:
- `orcamentos`

Stored data includes:
- auto-increment quote number
- creation timestamp
- full quote snapshot in `payload_json`
- mirror fields for search and listing, such as client name, seller name, date, and total

This allows the history view to remain fast while preserving a complete quote snapshot for reopening and PDF regeneration.

## PDF Generation

PDF generation is handled in the browser via a print-friendly HTML document opened in a new window. The user can print to PDF from the browser without a separate PDF service.

Key traits:
- uses the currently loaded quote data
- supports reopened historical quotes
- keeps the server-side implementation simple

## Quote History

History is powered by the `orcamentos` table plus lightweight search filters.

Supported operations:
- list saved quotes
- search by quote number, client, seller, date, and date range
- open a quote for review
- regenerate its PDF
- duplicate a historical quote as a new one
- delete a quote with admin authorization

The original saved record is preserved when a quote is reused. Duplication is the safe operational pattern.

## Admin Authentication and Controls

Admin features are protected by a token checked in the backend.

Admin-only capabilities include:
- loading internal price configuration
- updating internal price configuration
- deleting quotes from history
- exposing admin-only details where applicable

In the public portfolio version, the token is intentionally a demo placeholder configured through `BUDGET_PANEL_ADMIN_TOKEN`.
