#!/bin/bash
# 누끼컷 로컬 개발 서버 종료 스크립트
# PID로 종료하지 않고 포트 점유 프로세스를 직접 종료한다 —
# `npm run dev`가 실제 vite 프로세스에 자리를 넘기고 먼저 끝나버리면
# vite가 고아 프로세스가 되어 npm의 PID로는 더 이상 찾을 수 없기 때문.

PID_FILE="/tmp/removebg-dev.pid"
PORT_FILE="/tmp/removebg-dev.port"
PORT="${1:-$(cat "$PORT_FILE" 2>/dev/null || echo 5173)}"

if ! fuser "$PORT/tcp" >/dev/null 2>&1; then
    echo "서버가 실행 중이 아닙니다 (포트 $PORT)"
    rm -f "$PID_FILE" "$PORT_FILE"
    exit 0
fi

fuser -k -TERM "$PORT/tcp" >/dev/null 2>&1
sleep 1
if fuser "$PORT/tcp" >/dev/null 2>&1; then
    fuser -k -KILL "$PORT/tcp" >/dev/null 2>&1
fi

echo "✓ 서버 종료됨 (포트 $PORT)"
rm -f "$PID_FILE" "$PORT_FILE"
