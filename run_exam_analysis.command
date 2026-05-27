#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "[1/3] 의존성 확인 중..."
if [ ! -d "node_modules" ]; then
  npm install
fi

echo "[2/3] 앱 빌드 중..."
npm run build

echo "[3/3] 앱 실행 중..."
npm run desktop:start
