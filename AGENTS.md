# Repository Guidelines

## Project Structure & Module Organization
Root documentation lives at `PROJECT_STRUCTURE.md`. `backend/` hosts the FastAPI service; application code sits in `backend/app/`, reusable helpers in `backend/backend/`, and database scripts under `backend/scripts/`. `frontend/` contains the Vite + React client (`src/`), typed API stubs in `api/`, and compiled assets in `dist/`. The resume processing toolkit is in `standalone_resume_pipeline/src/`, with sample inputs in `standalone_resume_pipeline/data/`. Shared configuration sits in `config/`, while `missing_bucket/` and `uploads/` hold working files ignored by Git.

## Build, Test, and Development Commands
Set up the backend with `python -m pip install -r backend/requirements.txt`. Launch the API via `python -m uvicorn backend.app.main:app --reload --port 8000`. Run backend checks with `python -m pytest -s backend/tests/test_db_schema.py`. Frontend work starts with `npm install` inside `frontend/`, then `npm run dev` for local development, `npm run build` for production bundles, and `npm run preview -- --port 5173` to review the build. The standalone pipeline scripts run from the repo root, e.g. `python standalone_resume_pipeline/run_llm_parse.py`.

## Coding Style & Naming Conventions
Python modules use 4-space indentation, snake_case for functions and variables, and CapWords for classes. Prefer FastAPI’s dependency injection patterns and keep I/O boundaries isolated under `backend/app/api/`. TypeScript/React files follow the Vite defaults: 2-space indentation, PascalCase component folders (e.g. `ProfileCard.tsx`), and camelCase hooks/utilities. Keep environment-specific settings in `.env` files; never commit secrets.

## Testing Guidelines
Backend tests rely on `pytest`; add files named `test_*.py` under `backend/tests/` and use fixtures to stub Supabase access. Capture schema changes with assertions similar to `test_db_schema.py`. The frontend currently lacks an automated test suite—add new tests under `frontend/src/__tests__/` using `vitest` when introducing critical UI logic, and document manual QA steps in pull requests. For pipeline scripts, supply minimal sample data in `standalone_resume_pipeline/data/` and confirm outputs before pushing.

## Commit & Pull Request Guidelines
Recent commits are concise, lowercase summaries (e.g. `search company`); continue the same, writing imperative messages that describe the change. Group work logically and rebase before opening a PR. Pull requests should link related issues, describe backend/frontend impact, include setup or migration notes, and attach screenshots or sample payloads when UI or API responses change.

## Configuration & Security Notes
Copy `backend/.env.example` to `.env` at the repository root or inside `backend/` and fill in Supabase credentials. Verify that credentials match the Supabase connection info (`SUPABASE_DB_HOST`, `SUPABASE_DB_PORT`, etc.) and that `SUPABASE_DB_SSLMODE` is set to `require`. Store external service keys only in local `.env` files; scrub them from issue or PR comments. When sharing logs, redact any tokens or applicant data exported from the pipeline.
