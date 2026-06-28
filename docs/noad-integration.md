# noad.ai.kr 통합 설계 (한의원 + 테니스)

> 이 문서는 **테니스 repo(`wooseokch-svg/sultan-tennis`, Next.js/Prisma/Postgres) 세션에서 실행**하기 위한 핸드오프 설계서다.
> 한의원 repo(`lamihani-homepage`)에서는 테니스 코드를 볼 수 없어 여기에 정리한다.

## 확정 방향 (결정됨)
- **통합 코어 = 테니스 백엔드** (Next.js / Prisma / PostgreSQL on EC2). 이미 **토스 구독결제가 운영 중**.
- **토스 결제는 noad와 같은 사업자로 이미 라이브** → 한의원 결제를 **승인 대기 없이 바로** 얹을 수 있음.
- **테넌트(Tenant) = 클럽(CLUB) | 한의원(CLINIC).** 둘 다 noad에 구독료를 낸다.
- 한의원 **제품기능(예약/예진표/공지)** 은 **Supabase 그대로 유지.** 한의원의 **"결제"만** 코어(테니스 백엔드)로 라우팅.
- **super-admin** = 테니스 앱에 섹션 추가 → 전체 테넌트/구독/결제/작업티켓 관리.

## 가격
| 등급 | 한의원(CLINIC) | 테니스(CLUB) |
|---|---|---|
| BASIC/Light | 33,000 | 33,000 |
| STANDARD | **66,000** (+작업티켓 1) | 55,000 |
| PRO | 99,000 (+작업티켓 2) | 99,000 |
- 연 결제 10% 할인(한의원). 모두 **VAT 포함**.
- 가격이 테넌트 종류별로 다르므로, `Plan` enum(BASIC/STANDARD/PRO)은 **추상 등급**으로 두고
  **가격표는 `tenantType`별로 분리**(코드 상수 또는 PlanPrice 테이블) 권장.

## 데이터 모델 변경 (테니스 Prisma)
현재: `Subscription`(clubId unique, plan, interval, tossBillingKey/CustomerKey, status, periods, pendingPlan…) + `Payment`(subscriptionId, clubId, orderId, paymentKey, amount, status, plan, interval…) + `BillingHandoverToken`.

1. **테넌트 일반화**
   - `enum TenantType { CLUB, CLINIC }`
   - 권장: `Tenant` 테이블 신설(`id, type, name, slug, createdAt`). `Club`은 `Tenant(type=CLUB)`와 1:1 매핑, 한의원은 `Tenant(type=CLINIC)` 행으로(예: slug=`lamihani`).
   - `Subscription`/`Payment`의 `clubId` → **`tenantId`** 로 일반화(마이그레이션). 
   - (덜 침습적 대안) `Subscription`/`Payment`에 `tenantType` + nullable `clinicId` 추가하고 `Clinic` 테이블 신설.
2. **작업티켓(한의원 전용)** — 이미 한의원 Supabase에 `supabase/tickets.sql`로 구현된 모델을 코어로 이전:
   - `TicketLedger(tenantId, delta, reason, refId, createdAt)` — 잔액 = Σdelta
   - `WorkRequest(tenantId, type[배너/팝업/기능수정/디자인수정/기타], title, content, status[요청/진행중/완료/취소], adminNote, createdAt)`
   - STANDARD = 매월 +1, PRO = 매월 +2 자동지급(구독 청구 시). 티켓 단품 구매 = +1 (55,000원, VAT 포함).
   - 1티켓 = **최대 2시간 작업 분량**. 초과 시 관리자가 별도 연락.

## 결제 플로우 (한의원이 코어 토스 빌링을 탐)
1. 한의원 admin "결제" 탭의 **결제하기** → 중앙 빌링 페이지로 이동(이미 한의원 쪽 구현됨):
   ```
   https://noad.ai.kr/billing?tenantType=clinic&clinicId=<clinicId>&plan=<light|standard|pro>&interval=<monthly|yearly>
   (티켓 구매는 &item=ticket)
   ```
   → 한의원 `js/config.js`의 `NOAD_BILLING_URL`만 채우면 이 링크가 활성화됨(지금은 빈 값=‘준비중’ 안내).
2. **테니스 앱에서 만들 것: `/billing` 페이지**
   - 위 쿼리 파라미터를 받아 해당 `Tenant` 확인/생성(CLINIC, clinicId=slug)
   - 토스 **빌링키 발급(SDK)** → `Subscription(tenant=CLINIC)` upsert, `tossBillingKey` 저장
   - 이후 **매월 cron**: 테넌트별 빌링키로 자동청구 → `Payment` 생성 (테니스에 이미 있는 청구 로직을 tenant 단위로 일반화)
   - `BillingHandoverToken` 패턴 재사용 가능(중앙도메인에서 빌링키 발급 후 핸드오버).
3. 결제 성공 → 한의원으로 복귀(예: `?paid=1`) 또는 noad 대시보드로.

## super-admin 범위 (테니스 앱에 추가)
- **테넌트 목록**: 클럽/한의원 필터, 검색. 각 구독 상태/플랜/다음청구일.
- **결제**: 결제이력, 실패/재시도 모니터, 수동 조정.
- **작업티켓**(한의원): 작업요청 처리(요청→진행중→완료, `adminNote`), **티켓 수동 지급**(원장 +N).
- (선택) 테니스 클럽 운영지표.

## 한의원(lamihani-homepage) 측 — 이미 준비됨
- `js/config.js` : `NOAD_BILLING_URL` (빈 값=준비중). 테니스 `/billing` 준비되면 채우면 끝.
- `js/admin.js` `checkout()` : URL 있으면 위 파라미터로 자동 리다이렉트.
- `supabase/tickets.sql` : 작업티켓/작업요청 모델(코어 이전 시 Prisma로 1:1 이식).
- 작업요청 탭 : 한의원이 티켓으로 요청 제출/진행상황 확인(현재는 Supabase 기준 동작).
  - 통합 후에는 작업요청도 코어로 보낼지, Supabase 유지 후 super-admin이 양쪽을 읽을지 결정 필요.

## 미해결/다음 결정
- 작업요청 데이터를 코어(Prisma)로 옮길지 vs 한의원 Supabase 유지 + super-admin이 양쪽 조회.
- 한의원 인증(Supabase Auth) ↔ 테니스 인증(NextAuth) 연계: 결제 페이지에서 한의원 관리자를 어떻게 식별할지(서명된 토큰/일회용 핸드오버 토큰 권장).
