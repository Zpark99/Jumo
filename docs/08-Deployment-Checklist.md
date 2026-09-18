# 08. 배포 체크리스트

## 환경변수
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `KIS_APP_KEY` / `KIS_APP_SECRET`
- (실제 변수명은 `.env.example` 기준)

## 빌드
- [ ] `npm run build` 통과
- [ ] 타입 체크 / 린트

## Vercel
- [ ] 환경변수 등록
- [ ] 도메인 연결

## 배포 전 점검
- [ ] RLS 정책 확인
- [ ] 시크릿 노출 여부 점검
