#!/usr/bin/env bash
#
# 라미한의원 홈페이지 이미지 로컬화 스크립트
# --------------------------------------------------
# index.html 이 참조하는 cdn.imweb.me 이미지를 모두 images/ 폴더로 내려받고,
# HTML 안의 URL 을 로컬 경로(images/...)로 바꿔줍니다.
#
# 사용법 (네트워크가 되는 PC에서, 이 저장소 폴더 안에서 실행):
#   bash download-images.sh
#
# 실행 후 변경 사항을 커밋하세요:
#   git add -A && git commit -m "이미지 로컬 보관 및 경로 교체"
#   git push
#
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p images

# index.html 에서 cdn.imweb.me 이미지 URL 추출 (중복 제거)
urls=$(grep -oE 'https://cdn\.imweb\.me/[^"'"'"')[:space:]]+\.(png|jpg|jpeg|gif|svg|webp)' index.html | sort -u)

if [ -z "$urls" ]; then
  echo "이미지 URL을 찾지 못했습니다. 이미 로컬화되었을 수 있습니다."
  exit 0
fi

count=0
fail=0
while IFS= read -r url; do
  [ -z "$url" ] && continue
  fname=$(basename "$url")
  dest="images/$fname"
  echo "↓ $url"
  if curl -fsSL --retry 3 -o "$dest" "$url"; then
    # HTML 안의 전체 URL을 로컬 경로로 치환 (URL의 특수문자 이스케이프)
    esc_url=$(printf '%s' "$url" | sed -e 's/[\/&]/\\&/g')
    sed -i "s/$esc_url/images\/$fname/g" index.html
    count=$((count + 1))
  else
    echo "  ✗ 다운로드 실패: $url"
    fail=$((fail + 1))
  fi
done <<< "$urls"

echo "----------------------------------------"
echo "완료: $count개 다운로드·교체, 실패 $fail개"
echo "images/ 폴더와 index.html 변경분을 커밋하세요."
