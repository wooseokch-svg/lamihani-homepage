# Lightsail 자가호스팅 Supabase 배포 가이드

라미한/멀티테넌트 시스템을 **AWS Lightsail 한 대**에 올리는 방법.
구조: **Lightsail = Supabase 백엔드**(DB·Auth·API), **정적 사이트는 그대로 GitHub Pages** 유지.
나중에 정적 사이트까지 옮기고 싶으면 Nginx로 같이 서빙하면 됨.

```
[환자/관리자 브라우저]
        │
        ├─ 정적 홈페이지  →  GitHub Pages (병원별 도메인)
        │
        └─ DB/API 호출   →  https://api.noad.ai.kr  ─┐
                                                      │ Nginx + SSL
                                          [Lightsail 2GB]
                                          └ Docker: Supabase 풀스택
                                             (Postgres·Auth·PostgREST·Kong·Studio)
```

> 💡 `api.noad.ai.kr` 는 예시. 본인 도메인의 서브도메인으로 바꿔서 쓰면 됨.

---

## 0. 준비물
- AWS 계정
- 도메인 (예: `noad.ai.kr`) — DNS 레코드를 추가할 수 있어야 함
- 터미널(SSH) — Windows면 PowerShell 또는 PuTTY

---

## 1. Lightsail 인스턴스 생성
1. AWS 콘솔 → **Lightsail** 검색 → 접속
2. **Create instance**
3. **Region**: 서울(`ap-northeast-2`)
4. **Platform**: Linux/Unix → **OS Only → Ubuntu 22.04 LTS** (또는 24.04)
5. **Instance plan**: **$12 / 2 GB RAM / 2 vCPU / 60 GB SSD** 선택
   - (1GB도 되지만 빠듯함. 2GB 권장)
6. 인스턴스 이름 지정 → **Create instance**

## 2. 고정 IP(Static IP) 붙이기
1. Lightsail → **Networking** 탭 → **Create static IP**
2. 방금 만든 인스턴스에 attach → 이름 짓고 생성
3. 표시되는 **고정 IP 주소**를 메모 (예: `13.125.x.x`)

## 3. 방화벽(포트) 열기
Lightsail 인스턴스 → **Networking** 탭 → **IPv4 Firewall** 에서 아래 추가:
| Application | Protocol | Port |
|---|---|---|
| SSH | TCP | 22 (기본) |
| HTTP | TCP | 80 |
| HTTPS | TCP | 443 |

> ⚠ Supabase 내부 포트(8000, 5432 등)는 **외부에 열지 마세요.** Nginx(80/443)를 통해서만 접근.

## 4. DNS 연결
도메인 관리 페이지(가비아/카페24/Route53 등)에서 **A 레코드** 추가:
```
api.noad.ai.kr   →   <고정 IP 주소>
```
(원하면 Studio 대시보드용으로 `studio.noad.ai.kr` 도 같은 IP로 추가)

## 5. 서버 접속 & 기본 세팅
Lightsail → 인스턴스 → **Connect using SSH** (브라우저 터미널) 또는 본인 터미널에서 키로 접속.

이 repo의 `deploy/01-bootstrap.sh` 내용을 서버에 올려 실행 (Docker + 방화벽 설치):
```bash
# 서버에서
curl -fsSL https://raw.githubusercontent.com/wooseokch-svg/lamihani-homepage/main/deploy/01-bootstrap.sh -o bootstrap.sh
bash bootstrap.sh
# 끝나면 한 번 로그아웃 후 재접속 (docker 그룹 적용)
exit
```

## 6. Supabase 자가호스팅 올리기
재접속 후:
```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

`.env` 파일을 열어(`nano .env`) **반드시 아래 값들을 바꿉니다**:
| 키 | 설명 |
|---|---|
| `POSTGRES_PASSWORD` | DB 비밀번호 (길게 랜덤) |
| `JWT_SECRET` | 40자 이상 랜덤 문자열 |
| `ANON_KEY` | JWT_SECRET으로 서명한 anon 토큰 |
| `SERVICE_ROLE_KEY` | JWT_SECRET으로 서명한 service_role 토큰 |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | Studio 로그인 계정 |
| `SITE_URL` | `https://api.noad.ai.kr` |
| `API_EXTERNAL_URL` | `https://api.noad.ai.kr` |
| `SUPABASE_PUBLIC_URL` | `https://api.noad.ai.kr` |

> 🔑 **ANON_KEY / SERVICE_ROLE_KEY 생성**: JWT_SECRET을 먼저 정한 뒤,
> 공식 생성기에서 만드세요 →
> https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys
> (JWT_SECRET 입력하면 anon/service_role 키를 만들어 줍니다.)

실행:
```bash
docker compose pull
docker compose up -d
docker compose ps      # 전부 healthy 인지 확인 (1~2분 소요)
```

## 7. Nginx + SSL (HTTPS)
```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx

# 이 repo의 nginx-supabase.conf.example 내용을 복사 (도메인만 본인 걸로 수정)
sudo nano /etc/nginx/sites-available/supabase
sudo ln -s /etc/nginx/sites-available/supabase /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# SSL 자동 발급 (Let's Encrypt, 무료, 자동갱신)
sudo certbot --nginx -d api.noad.ai.kr
```
→ 이제 `https://api.noad.ai.kr` 로 Supabase API 접속 가능.

## 8. 스키마 + 관리자 만들기
1. **Studio 접속**: 보안상 SSH 터널 권장
   ```bash
   # 내 PC에서
   ssh -L 3000:localhost:3000 ubuntu@<고정IP>
   # 브라우저에서 http://localhost:3000  (DASHBOARD_USERNAME/PASSWORD 로 로그인)
   ```
2. Studio → **SQL Editor** 에서 이 repo의 SQL을 순서대로 실행:
   `supabase/schema.sql` → `booking.sql` → `update-hours.sql` → `unify.sql` → `multitenant.sql`
3. Studio → **Authentication → Users → Add user** 로 관리자 생성
   (예: `lamiadmin@gmail.com` / 비번). **Auto Confirm User 체크**.
4. SQL Editor에서 매핑:
   ```sql
   insert into public.clinic_admins(user_id, clinic_id)
     select id, 'lamihani' from auth.users where email = 'lamiadmin@gmail.com'
     on conflict (user_id) do update set clinic_id = excluded.clinic_id;
   ```

## 9. 우리 사이트를 새 백엔드로 연결
`js/config.js` 의 값을 새 서버 것으로 교체:
```js
window.LAMI_CONFIG = {
  SUPABASE_URL: 'https://api.noad.ai.kr',
  SUPABASE_ANON_KEY: '<6단계에서 만든 ANON_KEY>',
  CLINIC_ID: 'lamihani',
  NAVER_RESERVE_URL: '...'
};
```
커밋 → 배포하면 사이트가 새 Lightsail 백엔드를 사용.

---

## 운영 체크리스트
- **백업**: `docker compose` 의 postgres 볼륨을 정기적으로 `pg_dump`.
  ```bash
  docker compose exec -T db pg_dump -U postgres postgres | gzip > ~/backup-$(date +%F).sql.gz
  ```
  → cron으로 매일 + 다른 곳(S3 등)에 복사 권장.
- **보안 업데이트**: `sudo apt-get update && sudo apt-get upgrade -y` 주기적으로.
- **SSL 자동갱신**: certbot이 자동 처리 (`sudo certbot renew --dry-run` 으로 점검).
- **단일 서버 = 단일 장애점**: 중요해지면 스냅샷(백업 이미지) 정기 생성.

## 새 병원 추가 시
1. 새 병원 정적 사이트(도메인) 준비 — `config.js`의 `CLINIC_ID`만 다르게.
2. Studio에서 그 병원 관리자 계정 생성 + `clinic_admins` 매핑.
3. `clinic_settings`에 운영시간 한 줄 insert (또는 admin 화면에서 저장).
→ **DB/서버는 그대로**, 행만 늘어남.

---

### 더 간단한 대안 (참고)
자가호스팅 관리가 부담되면: **Supabase는 매니지드 그대로 쓰고**(무료~$25),
Lightsail은 **정적 사이트 + 결제 포털 서빙**에만 쓰는 방법도 있음.
관리 수고가 확 줄어듦. (이 가이드는 "전부 AWS" 기준)
