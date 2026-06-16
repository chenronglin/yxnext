#!/usr/bin/env bash

# 当前脚本用于管理本项目的生产态 Next.js 服务，统一封装启动、停止、重启、状态查看和日志查看。
# 默认启动命令保持为用户当前使用方式：PORT=13100 nohup bun run start > app.log 2>&1 &
set -euo pipefail

APP_NAME="v0-app"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-13100}"
PID_FILE="${PID_FILE:-${ROOT_DIR}/app.pid}"
LOG_FILE="${LOG_FILE:-${ROOT_DIR}/app.log}"

cd "${ROOT_DIR}"

usage() {
  cat <<EOF
用法: ./run.sh {start|stop|restart|status|logs}

环境变量:
  PORT      服务端口，默认 13100
  PID_FILE  进程号文件，默认 ${PID_FILE}
  LOG_FILE  日志文件，默认 ${LOG_FILE}

示例:
  ./run.sh start
  PORT=13101 ./run.sh restart
  ./run.sh logs
EOF
}

read_pid() {
  # pid 文件不存在时直接返回空值，让调用方可以统一判断服务是否已启动。
  if [[ ! -f "${PID_FILE}" ]]; then
    return 1
  fi

  local pid
  pid="$(tr -d '[:space:]' < "${PID_FILE}")"

  if [[ -z "${pid}" ]]; then
    return 1
  fi

  printf '%s\n' "${pid}"
}

is_running() {
  local pid="$1"

  # kill -0 只检查进程是否存在，不会真的发送终止信号，适合做状态探测。
  kill -0 "${pid}" >/dev/null 2>&1
}

start_app() {
  local pid

  if pid="$(read_pid)" && is_running "${pid}"; then
    echo "${APP_NAME} 已在运行，PID=${pid}，端口=${PORT}"
    return 0
  fi

  # 清理陈旧 pid 文件，避免上一次异常退出后影响本次启动判断。
  rm -f "${PID_FILE}"

  echo "正在启动 ${APP_NAME}，端口=${PORT}，日志=${LOG_FILE}"
  PORT="${PORT}" nohup bun run start > "${LOG_FILE}" 2>&1 &
  pid="$!"
  printf '%s\n' "${pid}" > "${PID_FILE}"

  # 给服务一个很短的启动窗口；如果进程立刻退出，直接提示用户查看日志。
  sleep 1

  if is_running "${pid}"; then
    echo "${APP_NAME} 启动成功，PID=${pid}"
    return 0
  fi

  echo "${APP_NAME} 启动失败，请查看日志：${LOG_FILE}" >&2
  rm -f "${PID_FILE}"
  return 1
}

stop_app() {
  local pid

  if ! pid="$(read_pid)"; then
    echo "${APP_NAME} 未运行：没有找到 pid 文件 ${PID_FILE}"
    return 0
  fi

  if ! is_running "${pid}"; then
    echo "${APP_NAME} 未运行：pid 文件中的进程 ${pid} 不存在，已清理 pid 文件"
    rm -f "${PID_FILE}"
    return 0
  fi

  echo "正在停止 ${APP_NAME}，PID=${pid}"
  kill "${pid}"

  # 先优雅等待，再兜底强制结束；这样可以让 Next.js 有机会完成退出清理。
  for _ in {1..15}; do
    if ! is_running "${pid}"; then
      rm -f "${PID_FILE}"
      echo "${APP_NAME} 已停止"
      return 0
    fi

    sleep 1
  done

  echo "${APP_NAME} 未在 15 秒内退出，执行强制停止，PID=${pid}"
  kill -9 "${pid}" >/dev/null 2>&1 || true
  rm -f "${PID_FILE}"
  echo "${APP_NAME} 已强制停止"
}

status_app() {
  local pid

  if pid="$(read_pid)" && is_running "${pid}"; then
    echo "${APP_NAME} 正在运行，PID=${pid}，端口=${PORT}"
    return 0
  fi

  echo "${APP_NAME} 未运行"
  return 1
}

logs_app() {
  # tail -F 可以在日志轮转或文件重建后继续跟踪，适合 nohup 输出文件。
  touch "${LOG_FILE}"
  tail -n 100 -F "${LOG_FILE}"
}

case "${1:-}" in
  start)
    start_app
    ;;
  stop)
    stop_app
    ;;
  restart)
    stop_app
    start_app
    ;;
  status)
    status_app
    ;;
  logs)
    logs_app
    ;;
  *)
    usage
    exit 2
    ;;
esac
