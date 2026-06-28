# Cloudflare 연결 가이드 (A안 — 100병원/100도메인 SSL 자동화)

목표: **정적 사이트(코드 1개)를 Cloudflare에 올리고**, 병원 도메인마다 **HTTPS 인증서를 자동**으로.
백엔드(Supabase)는 매니지드 그대로. 코드는 GitHub에 그대로(창고), 호스팅만 Cloudflare로.

```
GitHub 저장소(코드) ──자동배포──▶ Cloudflare Pages (정적 사이트 1개)
                                       ▲
              병원 도메인들 ───────────┘  (전부 같은 빌드로 연결)
              lamihani.com, 병원B.com ...   각 도메인 SSL 자동
                                       │
              브라우저 ── DB/API ──▶ 매니지드 Supabase (모든 병원 공유)
```

> 핵심: 모든 병원 도메인이 **같은 Pages 사이트**를 가리키고, 사이트의 `config.js`가
> 접속 도메인을 보고 어느 병원인지 자동 판별(이미 구현됨). 그래서 도메인이 100개여도 빌드는 1개.

---

## Phase 1 — 지금 사이트를 Cloudflare로 (오늘 할 일)

### 1. Cloudflare 계정 + 사이트를 Pages로 배포
1. https://dash.cloudflare.com 가입(무료)
2. 좌측 **Workers & Pages → Create → Pages → Connect to Git**
3. GitHub 연동 → `wooseokch-svg/lamihani-homepage` 선택
4. 빌드 설정:
   - **Framework preset**: None
   - **Build command**: (비움)
   - **Build output directory**: `/` (루트)
   - Production branch: `main`
5. **Save and Deploy** → `xxxx.pages.dev` 주소가 생김. 접속해서 사이트 뜨는지 확인.

→ 이제 `main`에 푸시할 때마다 **자동 배포**. (GitHub Pages 대체)

### 2. 메인 도메인 연결 + SSL
**경우 A — 도메인을 Cloudflare에 등록(추천: 내가 산 도메인)**
1. Cloudflare 대시보드 → **Add a site** → `lamihani.com` 입력
2. 표시되는 **네임서버 2개**를 도메인 등록업체(가비아/카페24 등)에서 변경
   (도메인의 네임서버를 Cloudflare 것으로 교체 — 반영에 최대 몇 시간)
3. 등록 완료되면 → **Workers & Pages → 해당 Pages 프로젝트 → Custom domains → Set up a custom domain** → `lamihani.com` 추가
4. **SSL 자동 발급** (Cloudflare가 알아서). 끝.

> SSL 모드는 대시보드 **SSL/TLS → Overview → Full (strict)** 권장.

---

## Phase 2 — 새 병원 도메인 추가 (병원이 늘 때마다)

도메인 출처에 따라 두 가지:

### 경우 C-1 : 내가 직접 산 병원 도메인
가장 간단. Phase 1-2와 동일:
1. Cloudflare에 **Add a site**로 그 도메인 등록 (네임서버 변경)
2. Pages 프로젝트 **Custom domains**에 그 도메인 추가 → SSL 자동
3. `config.js`의 `CLINICS`에 한 줄 추가 후 푸시:
   ```js
   '병원B.com': { id: 'clinicB', naver: 'https://map.naver.com/...' },
   ```
→ 수십 개까지 이 방식으로 충분.

### 경우 C-2 : 병원이 "자기 도메인"을 가져옴 (대규모/진짜 SaaS)
병원이 이미 `clinicB.com`을 다른 곳에서 운영 중이고, 네임서버를 못 옮길 때.
→ **Cloudflare for SaaS (Custom Hostnames)** 사용:
1. 내 Cloudflare 존에서 **SSL/TLS → Custom Hostnames** 활성화
2. 병원에게 **CNAME 한 줄**만 요청:
   `clinicB.com → (내가 지정한 타깃, 예: ssl.noad.ai.kr)`
3. 병원이 CNAME 추가하면 → **Cloudflare가 그 도메인 SSL 자동 발급·갱신**
4. `config.js` `CLINICS`에 한 줄 추가
→ **100개, 1000개도 자동.** (호스트네임 100개까지 무료 구간 있음, 그 이상 소액 — 가입 시 현재 정책 확인)

> C-2는 API로 자동화 가능(병원 등록 시 호스트네임 자동 생성). 첫 외부 병원 들어올 때 스크립트 짜주면 됨.

---

## 새 병원 온보딩 체크리스트 (요약)
1. ☐ 도메인 준비 (내가 사거나 / 병원이 가져옴)
2. ☐ Cloudflare 연결 (C-1: site 추가+custom domain / C-2: custom hostname)
3. ☐ `config.js` `CLINICS`에 `도메인 → clinic_id` 한 줄 추가 → 푸시
4. ☐ Supabase: 그 병원 관리자 계정 생성 + `clinic_admins` 매핑
5. ☐ Supabase: `clinic_settings`에 운영시간 1줄 (또는 admin에서 저장)
→ 익숙해지면 **5분**.

## 비용
- Cloudflare Pages: **무료** (대역폭 무제한)
- 도메인 SSL: **무료** (Cloudflare 자동)
- Cloudflare for SaaS: 호스트네임 100개까지 무료 구간 + 그 이상 소액
- 도메인 등록비(병원당 연 1~1.5만원)는 별도 (Cloudflare 무관)

## GitHub Pages는?
Cloudflare Pages로 옮기면 GitHub Pages는 꺼도 됨(코드는 GitHub에 그대로).
당분간 병행해도 무방 — 도메인이 가리키는 쪽만 Cloudflare면 됨.
