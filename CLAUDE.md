# 프로젝트 메모 (라미한의원 / 멀티테넌트 한의원 홈페이지)

정적 사이트(HTML/CSS/JS, 빌드 없음) + Supabase 백엔드. 멀티테넌트(`clinic_id`).
개발 브랜치: `claude/vigilant-meitner-5dftb9` → main 병합 후 배포.
CSS/JS 변경 시 HTML의 `?v=N` 캐시버전 올릴 것.

## 인프라 방향 (확정: A안)
**목표: 병원 100개**. 채택안 = Cloudflare(호스팅+도메인 SSL) + 매니지드 Supabase(백엔드).
- 정적 사이트: Cloudflare Pages (코드 1개, 도메인으로 병원 자동 판별)
- 백엔드: 매니지드 Supabase (전 병원 공유 1프로젝트, `clinic_id` 구분)
- 병원 도메인 SSL: Cloudflare 자동 (내 도메인=site추가 / 병원 도메인=for SaaS)
- 가이드: `deploy/cloudflare-setup.md`, (대안 자가호스팅: `deploy/README.md`)

## 멀티테넌트 동작
- `js/config.js`의 `CLINICS` 맵: `도메인 → { id, naver }`. 미등록/localhost는 lamihani로 폴백.
- 새 병원 추가 = ① `CLINICS`에 한 줄 + 푸시 ② Supabase에 관리자 계정+`clinic_admins` 매핑 ③ `clinic_settings` 운영시간 1줄.
- 관리자 매핑은 `user_id` 기준 (이메일 변경 OK, 삭제·재생성 시 매핑 SQL 재실행 필요).

## ✅ 진행 상태 / ⏭ 다음 할 일
- ✅ 멀티테넌트 토대(도메인→clinic_id 자동판별) 완료
- ✅ Cloudflare **Phase 1 완료** — 사이트를 Cloudflare Pages로 배포함 (`*.pages.dev` 동작)
- ⏭ **도메인 미보유 상태. 도메인 나오면 Cloudflare Phase 2 이어서 진행:**
  1. Cloudflare **Add a site**로 도메인 등록 → 네임서버를 등록업체에서 변경
  2. Pages 프로젝트 → **Custom domains**에 도메인 추가 → SSL 자동
  3. `js/config.js` `CLINICS`에 `도메인 → clinic_id` 한 줄 추가 후 푸시
  4. SSL/TLS 모드 **Full (strict)** 권장
  - 상세: `deploy/cloudflare-setup.md` Phase 2
- ⏭ (도메인 확정 시) 메인 도메인을 `lamihani.com`으로 갈지 `noad.ai.kr` 계열로 갈지 결정
- ✅ 병원 admin **결제 탭** 완료 — 요금제(Light 33,000/Standard 55,000/Pro 99,000), 월/연(10%할인) 토글, 작업티켓(55,000) 구매. `checkout()`은 토스 승인 후 실연동(현재 placeholder).
- ✅ 병원 admin **작업요청(티켓) 탭** 완료 — 티켓으로 배너/팝업/기능수정/디자인수정 요청 + 진행상황. ⚠ **DB 필요: `supabase/tickets.sql` 실행해야 동작**(ticket_ledger/work_requests/submit_work_request/my_ticket_balance). 티켓 잔액=원장 합. 테스트 티켓은 tickets.sql 하단 주석 참고.
- ⏭ **noad.ai.kr 통합 super-admin (방향: "한 시스템에 통합")** — 같은 repo/Supabase에 병원(clinic)+테니스클럽(club) 공용 구조. 전체 병원·티켓작업·결제 + 노애드 테니스 결제/클럽관리. 아직 미착수.
- ⏭ 결제 실연동: 토스 구독결제(noad.ai.kr 신청중, 승인 ~1달). A케이스(병원이 너에게 구독료) → 중앙 포털 1도메인에만 결제. 빌링키 발급=중앙 도메인, 월청구=서버 API.

## 코드 메모
- `js/booking.js`: 예약 캘린더 순수함수 + 실제 운영시간 기본값(월~금 10:00-17:30, 토 10:00-14:00, 일 휴무, 점심접수마감/종료접수마감).
- `js/modal.js`: 통합 예약·예진표 모달. `js/admin.js`: 관리자(예약 캘린더/직접추가/공지/운영시간). `js/hours.js`/`js/notices.js`: 메인 표시.
- Supabase SQL: `supabase/` (schema/booking/update-hours/unify/multitenant) — 모두 실행됨.
- Supabase anon key는 공개 안전(클라이언트용). service_role 키는 절대 repo/사이트에 두지 말 것.
