#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$ROOT_DIR/.venv"

usage() {
  printf 'Usage: ./run.sh [clean|install|start|reset]\n'
  printf '\n'
  printf '  clean    Remove Python, test, and frontend build caches\n'
  printf '  install  Create the virtual environment and install dependencies\n'
  printf '  start    Start the backend and frontend development servers\n'
  printf '  reset    Clean caches, install dependencies, and start the app\n'
  printf '\n'
  printf 'Run without a command to use reset.\n'
}

clean() {
  printf 'Cleaning caches...\n'
  find "$ROOT_DIR/backend" "$ROOT_DIR/frontend" \
    -type d \( -name '__pycache__' -o -name '.pytest_cache' \) \
    -prune -exec rm -rf {} +
  rm -rf "$ROOT_DIR/.coverage" "$ROOT_DIR/htmlcov" \
    "$ROOT_DIR/backend/.coverage" "$ROOT_DIR/backend/htmlcov" \
    "$ROOT_DIR/frontend/dist"
}

install_dependencies() {
  command -v python3 >/dev/null || { printf 'Error: python3 is required.\n' >&2; exit 1; }
  command -v npm >/dev/null || { printf 'Error: npm is required.\n' >&2; exit 1; }

  if [[ ! -d "$VENV_DIR" ]]; then
    printf 'Creating Python virtual environment...\n'
    python3 -m venv "$VENV_DIR"
  fi

  printf 'Installing backend dependencies...\n'
  "$VENV_DIR/bin/python" -m pip install -r "$ROOT_DIR/backend/requirements-dev.txt"

  printf 'Installing frontend dependencies...\n'
  (cd "$ROOT_DIR/frontend" && npm ci)

  if [[ ! -f "$ROOT_DIR/.env" ]]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    printf 'Created .env from .env.example. Update its values before starting the backend.\n'
  fi
}

start() {
  [[ -x "$VENV_DIR/bin/python" ]] || { printf 'Run ./run.sh install first.\n' >&2; exit 1; }
  [[ -d "$ROOT_DIR/frontend/node_modules" ]] || { printf 'Run ./run.sh install first.\n' >&2; exit 1; }

  printf 'Backend: http://localhost:8000\n'
  printf 'Frontend: http://localhost:5173\n'
  printf 'Press Ctrl+C to stop both servers.\n'

  (cd "$ROOT_DIR/backend" && exec "$VENV_DIR/bin/python" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &
  backend_pid=$!
  (cd "$ROOT_DIR/frontend" && exec npm run dev -- --host 0.0.0.0) &
  frontend_pid=$!

  stop_servers() {
    kill "$backend_pid" "$frontend_pid" 2>/dev/null || true
  }
  trap stop_servers INT TERM EXIT
  wait "$backend_pid" "$frontend_pid"
}

command_name="${1:-reset}"
case "$command_name" in
  clean)
    clean
    ;;
  install)
    install_dependencies
    ;;
  start)
    start
    ;;
  reset)
    clean
    install_dependencies
    start
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
