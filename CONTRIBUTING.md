# Contributing to Noosphere

Thanks for your interest in contributing.

## Development Setup

See the [README](README.md) for prerequisites and setup instructions. You'll need:

- Python 3.11 + uv
- Node.js 18+ + npm
- A generated space in `web/public/spaces/`

## Making Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run the linter and type checker:
   ```bash
   cd web && npm run lint && npx tsc --noEmit
   ```
4. Test manually: start the server and frontend, verify your changes work
5. Open a pull request

## Code Style

- **TypeScript**: strict mode, no `any` (use eslint-disable sparingly with explanation)
- **Python**: standard formatting, type hints where practical
- **Commits**: use conventional format — `feat(web):`, `fix(server):`, `refactor(pipeline):`

## Project Structure

- `pipeline/` — Python data generation (vocab, embedding, reduction, clustering)
- `server/` — FastAPI backend (embedding operations, FAISS search)
- `web/` — React Three Fiber frontend (3D rendering, UI)

## License

By contributing, you agree that your contributions will be licensed under the AGPL v3 license.
