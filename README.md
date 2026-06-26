# lamihani-homepage

라미한의원 홈페이지 — 정적 사이트(공개) + Supabase 백엔드(예약·예진표·공지 관리).

## 구성

| 파일 | 설명 |
| --- | --- |
| `index.html` | 원페이지 메인 (진료과목 · 치료법 · 의료진소개 · 진료시간 · 위치안내 · 공지사항) |
| `admin.html` | 관리자 페이지 (예약 · 예진표 · 공지 관리) |
| `css/style.css` | 메인 스타일 (반응형) |
| `css/modal.css` | 예진표 · 예약 · 약관/방침 모달 스타일 |
| `css/admin.css` | 관리자 페이지 스타일 |
| `js/main.js` | 모바일 메뉴 · 스크롤 애니메이션 · 맨 위로 |
| `js/modal.js` | 예진표 모달 · 약관/개인정보 모달 |
| `js/reservation.js` | 홈페이지 간편 예약 모달 |
| `js/notices.js` | 공지사항 목록 로딩 |
| `js/admin.js` | 관리자 로직 (로그인 · CRUD) |
| `js/config.js` | **Supabase 키 설정 (직접 입력)** |
| `js/db.js` | Supabase 클라이언트 초기화 |
| `supabase/schema.sql` | DB 테이블 + 보안(RLS) |
| `supabase/functions/notify-alimtalk/` | 카카오 알림톡 발송 함수 |
| `images/` | 이미지 |
| `docs/SETUP.md` | **백엔드·알림톡 설정 가이드** |

## 기능

- **공개 사이트**: 진료 정보, 1:1 비대면 예진표, 홈페이지 간편 예약, 공지사항
- **관리자(`/admin.html`)**: 로그인 후 예약/예진표 확인·상태관리, 공지 작성·수정·삭제, 네이버 예약 바로가기
- **알림**: 새 예약·예진표 접수 시 관리자에게 카카오 알림톡 (Supabase Edge Function + Solapi)

> **설정 전에도 사이트는 정상 동작합니다.** Supabase 키를 넣기 전에는 예약 버튼이 네이버 예약으로 연결되고, 공지사항은 기본 안내문을 표시합니다.

## 백엔드 켜기

`docs/SETUP.md` 참고. 요약:
1. Supabase 프로젝트 생성 → `supabase/schema.sql` 실행
2. `js/config.js`에 `SUPABASE_URL`·`SUPABASE_ANON_KEY` 입력
3. Supabase Auth에 관리자 계정 생성 → `/admin.html` 로그인
4. (선택) 카카오 알림톡: 채널·템플릿 준비 후 Edge Function 배포 + Webhook 연결

## 로컬에서 보기

```bash
python3 -m http.server 8000
# http://localhost:8000 접속
```

## 참고

- 이미지는 `images/` 폴더에 보관(아임웹 CDN 의존 제거 완료).
- 네이버 예약은 외부 자동 연동 제약이 있어, 관리자 페이지에서 **바로가기 링크**로 함께 관리합니다.
