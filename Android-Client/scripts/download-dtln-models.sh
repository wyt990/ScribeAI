#!/usr/bin/env bash
# 下载 DTLN ONNX 模型到 app/src/main/assets/dtln（构建前执行一次即可）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/app/src/main/assets/dtln"
mkdir -p "$DEST"
BASE="https://github.com/breizhn/DTLN/raw/master/pretrained_model"
for f in model_1.onnx model_2.onnx; do
  echo "Downloading $f ..."
  curl -fsSL -o "$DEST/$f" "$BASE/$f"
done
echo "Done: $DEST"
