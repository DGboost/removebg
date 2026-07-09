#!/bin/bash
# 테스트 웹 서버 시작/종료 스크립트
# 사용법:
#   ./server.sh start [포트]  - 서버 시작 (기본 포트: 8766)
#   ./server.sh stop          - 서버 종료
#   ./server.sh status        - 서버 상태 확인
#   ./server.sh restart [포트] - 서버 재시작

PORT="${2:-8766}"
PID_FILE="/tmp/removebg-server.pid"
DIR="$(cd "$(dirname "$0")" && pwd)"

start_server() {
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "⚠ 이미 실행 중 (PID: $(cat "$PID_FILE"), 포트: $(cat /tmp/removebg-server.port 2>/dev/null || echo '?'))"
        exit 1
    fi
    cd "$DIR"
    python3 -m http.server "$PORT" &
    SERVER_PID=$!
    echo "$SERVER_PID" > "$PID_FILE"
    echo "$PORT" > /tmp/removebg-server.port
    sleep 1
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "✓ 서버 시작됨"
        echo "  URL: http://localhost:$PORT/누끼컷.dc.html"
        echo "  PID: $SERVER_PID"
        echo "  포트: $PORT"
        echo "  종료하려면: ./server.sh stop"
    else
        echo "✗ 서버 시작 실패 (포트가 사용 중일 수 있습니다: $PORT)"
        rm -f "$PID_FILE" /tmp/removebg-server.port
        exit 1
    fi
}

stop_server() {
    if [ ! -f "$PID_FILE" ]; then
        echo "서버가 실행 중이 아닙니다"
        exit 0
    fi
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        sleep 1
        if kill -0 "$PID" 2>/dev/null; then
            kill -9 "$PID"
        fi
        echo "✓ 서버 종료됨 (PID: $PID)"
    else
        echo "서버가 이미 종료되어 있습니다"
    fi
    rm -f "$PID_FILE" /tmp/removebg-server.port
}

status_server() {
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "✓ 실행 중 (PID: $(cat "$PID_FILE"), 포트: $(cat /tmp/removebg-server.port 2>/dev/null || echo '?'))"
    else
        echo "✗ 중지됨"
        rm -f "$PID_FILE" /tmp/removebg-server.port
    fi
}

case "$1" in
    start)   start_server ;;
    stop)    stop_server ;;
    status)  status_server ;;
    restart) stop_server; sleep 1; start_server ;;
    *)
        echo "사용법: $0 {start|stop|status|restart} [포트]"
        echo "  start [포트]   - 서버 시작 (기본 포트: 8766)"
        echo "  stop           - 서버 종료"
        echo "  status         - 서버 상태 확인"
        echo "  restart [포트] - 서버 재시작"
        exit 1
        ;;
esac
