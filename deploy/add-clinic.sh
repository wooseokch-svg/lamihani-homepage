#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# 새 병원 서브도메인을 noad.ai.kr 아래에 라이브로 올린다 (정적 사이트).
#
# 전제: 가비아에 *.noad.ai.kr 와일드카드 A레코드(→ 43.200.34.187)가 있음.
#       → 서브도메인 DNS는 자동 해결되므로 병원마다 DNS 등록 불필요.
#
# 서버(EC2)에서 실행:
#   sudo bash /var/www/lamihani/deploy/add-clinic.sh <서브도메인> <홈HTML파일>
#   예)  sudo bash /var/www/lamihani/deploy/add-clinic.sh sdental byeolnae.html
#
# 하는 일: nginx 정적 블록 생성 + Let's Encrypt SSL 발급 + reload.
# CSP(iframe 결제/작업/메시지)는 *.noad.ai.kr 와일드카드로 이미 커버됨.
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

SUB="${1:?사용법: add-clinic.sh <서브도메인> <홈HTML파일>  (예: sdental byeolnae.html)}"
HOME_FILE="${2:-index.html}"
DOMAIN="${SUB}.noad.ai.kr"
ROOT="/var/www/lamihani"
EMAIL="wooseok.ch@gmail.com"
CONF="/etc/nginx/sites-available/${SUB}"

if [ "$(id -u)" -ne 0 ]; then echo "❌ sudo 로 실행하세요."; exit 1; fi
if [ ! -f "${ROOT}/${HOME_FILE}" ]; then
  echo "❌ ${ROOT}/${HOME_FILE} 없음. 먼저 git push → 서버가 pull 하도록 하세요."; exit 1
fi

tee "$CONF" >/dev/null <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    root ${ROOT};
    index ${HOME_FILE};
    location / { try_files \$uri \$uri/ \$uri.html =404; }
}
NGINX

ln -sf "$CONF" "/etc/nginx/sites-enabled/${SUB}"
nginx -t
systemctl reload nginx
certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect
nginx -t && systemctl reload nginx

echo ""
echo "✅ https://${DOMAIN} 라이브 (홈=${HOME_FILE})"
echo "   남은 수동 2가지:"
echo "   1) js/config.js 의 CLINICS 에 '${DOMAIN}' → clinic_id 매핑 추가(+ 필요시 CLINIC_GROUPS/NAMES) 후 git push"
echo "   2) Supabase: clinic_settings(운영시간) + clinic_admins(관리자 매핑) 행 추가"
