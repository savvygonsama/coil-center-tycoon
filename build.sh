#!/usr/bin/env bash
# 소스를 파일 하나로 묶는다. 결과물 index.html 하나만 있으면 어디서든 더블클릭으로 돈다.
# assets.js(그림 27장 data URI)는 art/ 폴더에서 만든다 — make-assets.ps1 참고.
set -euo pipefail
cd "$(dirname "$0")"
{
  cat shell.html
  printf '<script>\n';  sed '/^if (typeof module/,$d' engine.js; printf '</script>\n'
  printf '<script>\n';  cat decks.js;                          printf '</script>\n'
  printf '<script>\n';  cat world.js;                          printf '</script>\n'
  printf '<script>\n';  cat issues.js;                         printf '</script>\n'
  [ -f assets.js ] && { printf '<script>\n'; cat assets.js;    printf '</script>\n'; }
  printf '<script>\n';  cat ui.js;                             printf '</script>\n'
} > index.html
echo "built index.html ($(wc -c < index.html) bytes)"
