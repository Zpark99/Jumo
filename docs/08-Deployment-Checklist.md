# 08. 배포 체크리스트

## 환경변수
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — 서버 전용(KIS 토큰·시세 저장). 클라이언트 노출 금지
- `KIS_APP_KEY` / `KIS_APP_SECRET`
- `KIS_BASE_URL` — **실전 도메인**(`openapi.koreainvestment.com:9443`). VTS(모의)로 두면 시세·캔들·호가가 `EGW00103`으로 거부됨
- `CRON_SECRET` — Vercel Cron 인증(`/api/cron/refresh-quotes`, 평일 16시대 KST 목록 시세 일괄 갱신, #165). **Production**에 등록. 없으면 cron이 돌아도 401로 아무것도 안 함
- (실제 변수명은 `.env.example` 기준)

## 운영 설정 (코드 밖에 사는 것 — "로컬 OK = 운영 OK"가 아니다)

2026-10 기간에 "로컬은 되는데 운영은 안 되는" 장애가 2건 나왔다. 둘 다 코드가 아니라 환경별 설정이 원인이었다.

- [ ] **Vercel env 변경 후 재배포** — env는 **새 배포에만** 적용된다. 대시보드에서 값만 고치면 운영은 그대로다
- [ ] **배포가 Production에 붙었는지 확인** — Preview에 붙으면 운영은 안 바뀐다. 릴리스 PR 머지 = Production 자동 배포
- [ ] **Supabase Auth → URL Configuration의 Redirect URLs에 운영 도메인 등록** — 코드는 `${window.location.origin}/`로 동적이므로 운영 도메인이 허용 목록에 없으면 로그인 후 복귀가 실패한다
- [ ] **GitHub에 연결된 Vercel 프로젝트가 운영 1개인지** — 사용하지 않는 프로젝트가 붙어 있으면 빌드 실패가 PR 체크를 UNSTABLE로 만든다
- [ ] 대시보드 설정 변경(Supabase/Vercel/KIS)은 `[운영]` 이슈로 기록 후 닫기 — PR이 없어 추적에서 증발하는 것을 막는다

## 빌드
- [ ] `npm run build` 통과
- [ ] 타입 체크 / 린트

## Vercel
- [ ] 환경변수 등록
- [ ] 도메인 연결

## 배포 전 점검
- [ ] RLS 정책 확인
- [ ] 시크릿 노출 여부 점검
