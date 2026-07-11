#!/bin/bash
# 누끼컷 로컬 개발 서버 시작 스크립트 (Vite)
# 사용법: ./start.sh [포트]  (기본 포트: 5173)
#
# 실행 여부/성공 판정은 PID가 아니라 포트 점유 여부로 확인한다 —
# `npm run dev`는 실제 vite 프로세스에 자리를 넘기고 먼저 끝날 수 있어서,
# npm의 PID로 살아있는지 검사하면 정상 기동인데도 실패로 오판할 수 있다.

PORT="${1:-5173}"
PID_FILE="/tmp/removebg-dev.pid"
PORT_FILE="/tmp/removebg-dev.port"
LOG_FILE="/tmp/removebg-dev.log"
DIR="$(cd "$(dirname "$0")" && pwd)"

if fuser "$PORT/tcp" >/dev/null 2>&1; then
    echo "⚠ 포트 $PORT 가 이미 사용 중입니다 (다른 인스턴스가 실행 중일 수 있어요)"
    exit 1
fi

cd "$DIR"
if [ ! -d node_modules ]; then
    echo "의존성 설치 중…"
    npm install
fi

nohup npm run dev -- --port "$PORT" --strictPort > "$LOG_FILE" 2>&1 &
disown
echo "$PORT" > "$PORT_FILE"

for i in $(seq 1 40); do
    grep -q "Local:" "$LOG_FILE" 2>/dev/null && break
    sleep 0.5
done

if fuser "$PORT/tcp" >/dev/null 2>&1; then
    fuser "$PORT/tcp" 2>/dev/null > "$PID_FILE"
    echo "✓ 개발 서버 시작됨"
    echo "  URL: http://localhost:$PORT/"
    echo "  로그: $LOG_FILE"
    echo "  종료하려면: ./stop.sh"
else
    echo "✗ 서버 시작 실패 (포트: $PORT)"
    cat "$LOG_FILE"
    rm -f "$PID_FILE" "$PORT_FILE"
    exit 1
fi
