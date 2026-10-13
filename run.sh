#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$ROOT_DIR/.venv"

case "$(uname -s)" in
  CYGWIN*|MINGW*|MSYS*)
    PLATFORM="windows"
    VENV_PYTHON="$VENV_DIR/Scripts/python.exe"
    ;;
  Darwin*)
    PLATFORM="macOS"
    VENV_PYTHON="$VENV_DIR/bin/python"
    ;;
  *)
    PLATFORM="Linux"
    VENV_PYTHON="$VENV_DIR/bin/python"
    ;;
esac

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

find_python() {
  if [[ "$PLATFORM" == "windows" ]] && command -v py >/dev/null 2>&1; then
    PYTHON_CMD=(py -3)
  elif command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD=(python3)
  elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD=(python)
  else
    printf 'Error: Python 3 is required and was not found in PATH.\n' >&2
    exit 1
  fi

  if ! "${PYTHON_CMD[@]}" -c 'import sys; raise SystemExit(sys.version_info < (3, 10))'; then
    printf 'Error: Python 3.10 or newer is required.\n' >&2
    exit 1
  fi
}

check_node() {
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 || {
    printf 'Error: Node.js and npm are required and were not found in PATH.\n' >&2
    exit 1
  }
  if ! node -e 'const [major, minor, patch] = process.versions.node.split(".").map(Number); const supported = (major === 22 && (minor > 22 || (minor === 22 && patch >= 2))) || (major === 24 && minor >= 15) || major >= 26; process.exit(supported ? 0 : 1)'; then
    printf 'Warning: the frontend recommends Node.js 22.22.2+, 24.15+, or 26+; continuing with the installed version.\n' >&2
  fi
}

clean() {
  printf 'Cleaning caches...\n'
  find "$ROOT_DIR/backend" "$ROOT_DIR/frontend" \
    -type d \( -name 'node_modules' -o -name 'dist' \) -prune -o \
    -type d \( -name '__pycache__' -o -name '.pytest_cache' \) \
    -prune -exec rm -rf {} +
  rm -rf "$ROOT_DIR/.coverage" "$ROOT_DIR/htmlcov" \
    "$ROOT_DIR/backend/.coverage" "$ROOT_DIR/backend/htmlcov" \
    "$ROOT_DIR/frontend/dist"
}

install_dependencies() {
  find_python
  check_node

  if [[ ! -x "$VENV_PYTHON" ]]; then
    if [[ -d "$VENV_DIR" ]]; then
      printf 'Recreating the virtual environment for %s...\n' "$PLATFORM"
      "${PYTHON_CMD[@]}" -m venv --clear "$VENV_DIR"
    else
      printf 'Creating the Python virtual environment...\n'
      "${PYTHON_CMD[@]}" -m venv "$VENV_DIR"
    fi
  fi

  printf 'Installing backend dependencies...\n'
  "$VENV_PYTHON" -m pip install -r "$ROOT_DIR/backend/requirements-dev.txt"

  printf 'Installing frontend dependencies...\n'
  (cd "$ROOT_DIR/frontend" && npm ci)

  if [[ ! -f "$ROOT_DIR/.env" ]]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    printf 'Created .env from .env.example. Update its values before using the backend.\n'
  fi
}

start() {
  [[ -x "$VENV_PYTHON" ]] || {
    printf 'Error: dependencies are not installed. Run ./run.sh install first.\n' >&2
    exit 1
  }
  [[ -d "$ROOT_DIR/frontend/node_modules" ]] || {
    printf 'Error: dependencies are not installed. Run ./run.sh install first.\n' >&2
    exit 1
  }
  check_node

  printf 'Backend: http://localhost:8000\n'
  printf 'Frontend: http://localhost:5173\n'
  printf 'Press Ctrl+C to stop both servers.\n'

  (cd "$ROOT_DIR/backend" && exec "$VENV_PYTHON" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &
  backend_pid=$!
  (cd "$ROOT_DIR/frontend" && exec npm run dev -- --host 0.0.0.0) &
  frontend_pid=$!

  stop_servers() {
    kill "$backend_pid" "$frontend_pid" 2>/dev/null || true
    wait "$backend_pid" "$frontend_pid" 2>/dev/null || true
  }

  trap stop_servers EXIT
  trap 'exit 130' INT TERM

  while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
    sleep 1
  done

  set +e
  if ! kill -0 "$backend_pid" 2>/dev/null; then
    wait "$backend_pid"
    server_status=$?
  else
    wait "$frontend_pid"
    server_status=$?
  fi
  set -e

  stop_servers
  trap - EXIT INT TERM
  return "$server_status"
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
