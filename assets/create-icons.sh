#!/bin/bash
# macOS 아이콘 생성 스크립트 (macOS에서 실행)
# ImageMagick 필요: brew install imagemagick

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ICONSET="$SCRIPT_DIR/AppIcon.iconset"
SVG_FILE="$SCRIPT_DIR/icon.svg"

mkdir -p "$ICONSET"

# SVG → PNG 변환 (각 사이즈)
for size in 16 32 64 128 256 512; do
  echo "생성 중: ${size}x${size}"
  if command -v rsvg-convert &> /dev/null; then
    rsvg-convert -w $size -h $size "$SVG_FILE" > "$ICONSET/icon_${size}x${size}.png"
    rsvg-convert -w $((size*2)) -h $((size*2)) "$SVG_FILE" > "$ICONSET/icon_${size}x${size}@2x.png"
  elif command -v convert &> /dev/null; then
    convert -background none -resize ${size}x${size} "$SVG_FILE" "$ICONSET/icon_${size}x${size}.png"
    convert -background none -resize $((size*2))x$((size*2)) "$SVG_FILE" "$ICONSET/icon_${size}x${size}@2x.png"
  elif command -v sips &> /dev/null; then
    # sips는 SVG를 직접 변환할 수 없으므로 PNG 생성
    python3 -c "
import subprocess
# 기본 녹색 아이콘 이미지 생성 (pillow 사용)
try:
    from PIL import Image, ImageDraw, ImageFont
    size = $size
    img = Image.new('RGBA', (size, size), (144, 238, 144, 255))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', size // 3)
    except:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), 'N++', font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size-tw)//2, (size-th)//2), 'N++', fill=(0, 100, 0, 255), font=font)
    img.save('$ICONSET/icon_${size}x${size}.png')

    size2 = size * 2
    img2 = Image.new('RGBA', (size2, size2), (144, 238, 144, 255))
    draw2 = ImageDraw.Draw(img2)
    try:
        font2 = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', size2 // 3)
    except:
        font2 = ImageFont.load_default()
    bbox2 = draw2.textbbox((0, 0), 'N++', font=font2)
    tw2, th2 = bbox2[2] - bbox2[0], bbox2[3] - bbox2[1]
    draw2.text(((size2-tw2)//2, (size2-th2)//2), 'N++', fill=(0, 100, 0, 255), font=font2)
    img2.save('$ICONSET/icon_${size}x${size}@2x.png')
except ImportError:
    print('Pillow not installed, skipping size $size')
" 2>/dev/null || true
  fi
done

# iconutil로 icns 생성
if ls "$ICONSET"/*.png 1> /dev/null 2>&1; then
  iconutil -c icns "$ICONSET" -o "$SCRIPT_DIR/icon.icns"
  echo "아이콘 생성 완료: $SCRIPT_DIR/icon.icns"
else
  echo "경고: PNG 파일을 생성할 수 없었습니다."
  echo "ImageMagick을 설치하세요: brew install imagemagick"
fi

rm -rf "$ICONSET"
