#!/bin/bash
set -e
MUYU_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$MUYU_ROOT"

if [ -d "$MUYU_ROOT/release/母狗张容.app" ]; then
  exec /usr/bin/open "$MUYU_ROOT/release/母狗张容.app"
fi

if command -v node >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; then
  MUYU_NODE="$(command -v node)"
elif [ -x "/Users/yunfeikong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]; then
  MUYU_NODE="/Users/yunfeikong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  echo "找不到 Node.js。请使用 release 文件夹里的母狗张容.app，或安装 Node.js 22 及以上版本。"
  read -r -p "按回车关闭…"
  exit 1
fi

"$MUYU_NODE" "$MUYU_ROOT/scripts/launch.mjs" || {
  read -r -p "启动遇到问题，按回车关闭…"
  exit 1
}
