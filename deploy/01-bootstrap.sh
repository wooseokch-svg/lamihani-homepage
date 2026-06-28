#!/usr/bin/env bash
# =====================================================================
#  Lightsail(Ubuntu) 초기 세팅 — Docker + Compose 설치
#  사용법: SSH 접속 후  bash 01-bootstrap.sh
# =====================================================================
set -euo pipefail

echo "▶ 패키지 업데이트..."
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git ufw

echo "▶ Docker 공식 저장소 등록..."
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

echo "▶ Docker 설치..."
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "▶ 현재 사용자(${USER})를 docker 그룹에 추가..."
sudo usermod -aG docker "$USER"

echo "▶ 방화벽(ufw) — SSH/HTTP/HTTPS만 허용..."
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo ""
echo "✅ 완료! Docker 버전:"
docker --version
echo ""
echo "⚠ docker 그룹 적용을 위해 한 번 로그아웃 후 다시 SSH 접속하세요."
echo "   (또는  newgrp docker  실행)"
