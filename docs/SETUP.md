# 라미한의원 백엔드 설정 가이드

공지사항 · 홈페이지 예약 · 1:1 예진표 관리 + 카카오 알림톡을 동작시키기 위한 설정 안내입니다.
**설정을 마치기 전에도 사이트는 정상 동작합니다**(예약 버튼은 네이버 예약으로 연결, 공지사항은 기본 안내문 표시).

---

## 1단계. Supabase 프로젝트 만들기

1. <https://supabase.com> 가입 → **New project** 생성 (Region: `Northeast Asia (Seoul)` 권장)
2. 프로젝트가 생성되면 좌측 **SQL Editor** → `supabase/schema.sql` 내용을 붙여넣고 **Run**
   - 공지/예약/예진표 테이블과 보안 정책(RLS)이 생성됩니다.
3. 좌측 **Project Settings → API** 에서 두 값을 복사
   - **Project URL**
   - **anon public** key (← 공개돼도 안전한 키)

## 2단계. 사이트에 키 입력

`js/config.js` 파일을 열어 두 값을 채웁니다.

```js
window.LAMI_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...(anon key)',
  NAVER_RESERVE_URL: 'https://map.naver.com/p/entry/place/1137949987'
};
```

저장 후 커밋·푸시하면 적용됩니다. 이때부터:
- 헤더 **예약하기** → 홈페이지 간편 예약 모달
- **공지사항** → DB의 공지 목록 표시
- **1:1 예진표 제출** → DB에 저장

## 3단계. 관리자 계정 만들기

1. Supabase **Authentication → Users → Add user** 로 관리자 이메일/비밀번호 생성
   (또는 Authentication → Providers에서 Email 활성화)
2. 브라우저에서 **`/admin.html`** 접속 → 방금 만든 계정으로 로그인
   - 예) `https://wooseokch-svg.github.io/lamihani-homepage/admin.html`
3. 탭에서 **예약 / 예진표 / 공지사항**을 관리할 수 있습니다.
   - 예약·예진표: 상태 변경(신규→확정/완료 등), 삭제
   - 공지: 작성·수정·삭제, 상단 고정
   - 우측 상단 **네이버 예약 관리** 버튼으로 네이버 예약 화면 바로가기

> 관리자 페이지는 검색엔진 비노출(noindex) 처리되어 있고, 데이터 접근은 로그인한 사용자만 가능합니다(RLS).

---

## 4단계. 카카오 알림톡 (예약·예진표 접수 알림)

> 알림톡은 **사전 준비에 며칠** 걸립니다(채널 개설·템플릿 심사). 그동안에도 예약/예진표는 관리자 페이지에서 정상 확인됩니다.

### 4-1. 준비물
- **카카오 비즈니스 채널** (카카오톡 채널 관리자센터에서 개설, 사업자 인증)
- **발송 대행사 계정** — 여기서는 [Solapi](https://solapi.com) 기준
  - Solapi에서 카카오 채널 연동 → **발신프로필 ID(pfId)** 발급
  - **알림톡 템플릿** 등록 후 카카오 심사 통과 → **템플릿 ID**
  - **발신번호** 등록 (SMS 대체발송용)
  - **API Key / API Secret** 발급

### 4-2. 템플릿 예시 (심사 신청 시)
```
[라미한의원] 새 #{종류} 접수

이름: #{이름}
연락처: #{연락처}
희망: #{희망}

관리자 페이지에서 확인해 주세요.
```
변수명(`#{종류}`, `#{이름}`, `#{연락처}`, `#{희망}`)을 그대로 사용하세요. 함수가 이 변수에 값을 채웁니다.

### 4-3. Edge Function 배포
```bash
# Supabase CLI 설치 후
supabase login
supabase link --project-ref <프로젝트ref>
supabase functions deploy notify-alimtalk

# 시크릿(환경변수) 등록
supabase secrets set \
  SOLAPI_API_KEY=... \
  SOLAPI_API_SECRET=... \
  ALIMTALK_PFID=... \
  ALIMTALK_TEMPLATE_ID=... \
  ADMIN_PHONE=01012345678 \
  SENDER_PHONE=023456789
```

### 4-4. Database Webhook 연결
Supabase **Database → Webhooks → Create a new hook**
- Table: `reservations` (INSERT) → Edge Function `notify-alimtalk` 호출
- 같은 방식으로 `intakes` (INSERT) 도 하나 더 생성

이제 새 예약/예진표가 들어오면 관리자 휴대폰으로 알림톡이 발송됩니다.

---

## 비용 참고 (소규모 기준)
- **Supabase**: 무료 플랜으로 충분 (소규모 트래픽)
- **GitHub Pages**: 무료
- **카카오 알림톡**: 건당 약 7~15원 (대행사별 상이) + SMS 대체발송 시 SMS 요금

## 자주 묻는 질문
- **Q. 네이버 예약도 한 화면에서 자동으로 보고 싶어요.**
  네이버 예약(스마트플레이스)은 외부 자동 연동 API가 제한적이라 실시간 통합은 어렵습니다.
  대신 관리자 페이지의 **네이버 예약 관리** 버튼으로 바로 이동해 함께 관리합니다.
- **Q. 알림을 이메일로도 받고 싶어요.**
  Edge Function에 이메일 발송(예: Resend) 로직을 추가하면 됩니다. 요청 주세요.
