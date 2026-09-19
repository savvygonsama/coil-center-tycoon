#!/usr/bin/env bash
# 소스 네 개를 파일 하나로 묶는다. 결과물 index.html 하나만 있으면 어디서든 더블클릭으로 돈다.
set -euo pipefail
cd "$(dirname "$0")"
{
  cat shell.html
  printf '<script>\n';  sed '/^if (typeof module/,$d' engine.js; printf '</script>\n'
  printf '<script>\n';  cat decks.js;                          printf '</script>\n'
  printf '<script>\n';  cat ui.js;                             printf '</script>\n'
} > index.html
echo "built index.html ($(wc -c < index.html) bytes)"
