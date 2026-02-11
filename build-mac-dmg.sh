#!/bin/bash
# ============================================================
# Notepad+ Mac - macOS DMG 빌드 스크립트
# macOS에서 실행하세요
# ============================================================

set -e

echo "============================================"
echo " Notepad+ Mac - DMG 빌드"
echo "============================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Node.js 확인
if ! command -v node &> /dev/null; then
    echo "Node.js가 필요합니다."
    echo "설치: brew install node"
    exit 1
fi

echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"
echo ""

# 1. 의존성 설치
echo "[1/4] 의존성 설치 중..."
npm install

# 2. 아이콘 생성
echo "[2/4] 아이콘 생성 중..."
if [ -f assets/create-icons.sh ]; then
    chmod +x assets/create-icons.sh
    bash assets/create-icons.sh 2>/dev/null || echo "  아이콘 생성 건너뜀 (기본 아이콘 사용)"
fi

# 3. 아키텍처 감지
ARCH=$(uname -m)
echo "[3/4] 빌드 중... (아키텍처: $ARCH)"

if [ "$ARCH" = "arm64" ]; then
    npm run build:mac:arm64
elif [ "$ARCH" = "x86_64" ]; then
    npm run build:mac
else
    npm run build:mac
fi

# 4. 결과 확인
echo ""
echo "[4/4] 빌드 결과:"
echo ""

DMG_FILE=$(find dist -name "*.dmg" -type f 2>/dev/null | head -1)

if [ -n "$DMG_FILE" ]; then
    echo "============================================"
    echo " DMG 생성 완료!"
    echo "============================================"
    echo ""
    echo " 파일: $DMG_FILE"
    echo " 크기: $(du -h "$DMG_FILE" | cut -f1)"
    echo ""
    echo " 설치 방법:"
    echo "   1. DMG 파일을 더블클릭"
    echo "   2. Notepad+ Mac 아이콘을 Applications 폴더로 드래그"
    echo "   3. Applications에서 실행"
    echo ""

    # Finder에서 열기
    open -R "$DMG_FILE" 2>/dev/null || true
else
    echo "경고: DMG 파일을 찾을 수 없습니다."
    echo "dist/ 디렉토리를 확인하세요."
    ls -la dist/ 2>/dev/null || true
fi
