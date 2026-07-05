@AGENTS.md

──────────────────────────────────────────

## 📋 이슈 → 작업 → 머지 워크플로우 (필수 루틴)

모든 기능/수정 작업은 아래 순서를 따른다. 임의로 건너뛰지 않는다.

### 1단계 — 이슈 생성 (작업 시작 시)
gh CLI로 이슈를 먼저 만든다.
- 제목: `[Pn] 작업 요약`
- 본문: 작업 내용 + DoD를 체크리스트(- [ ])로
- 라벨: bug / enhancement / refactor / chore 중 해당하는 것
- 마일스톤: 해당 Phase(P0~P4) 마일스톤에 연결
- assignee: @me
- 생성 후 이슈 번호를 사용자에게 알린다.

### 2단계 — 브랜치 생성
- git checkout main && git pull origin main (최신화 먼저)
- git checkout -b <type>/<간단한-설명>  (예: fix/quote-validation)
- 브랜치명에 `#`나 공백 금지. type은 feat/fix/refactor/chore.

### 3단계 — 작업 진행
- 코드/마이그레이션 작업 수행.
- 마이그레이션은 반드시 "파일 먼저 작성 → 커밋 → DB 적용" 순서.
  DB에 직접 SQL 실행 후 파일 누락 금지 (유령 마이그레이션 재발 방지).

### 4단계 — 커밋 마무리 루틴 (작업 끝날 때마다)
1. git status / git diff --stat 로 변경 확인
2. .env.local 등 비밀 파일이 안 잡혔는지 반드시 확인 (.gitignore 확인)
3. git add . && git commit -m "<type>: <한 줄 요약> (#이슈번호)"
   - 이슈를 완전히 끝내면 본문에 "Closes #N" 추가
4. git push -u origin <브랜치명>

### 5단계 — PR 생성
- gh pr create로 PR 생성 (base: main). 본문에 요약 + "Closes #이슈번호".
- 여기서 멈춘다. ⛔

### 6단계 — 머지 (⛔ 무조건 사용자 수동. Claude 자동 머지 절대 금지)
- Claude는 어떤 경우에도 머지하지 않는다.
- 사용자가 GitHub에서 PR "Files changed"를 직접 검토하고 머지한다.
- 사용자가 "머지 완료"라고 알리기 전까지 다음 단계로 넘어가지 않는다.

### 7단계 — 머지 후 로컬 정리 (사용자 "머지 완료" 확인 후)
- git checkout main && git pull origin main
- git branch -d <작업브랜치>
- 필요 시 마일스톤 상태 확인.

### 규칙 요약
- 이슈 없이 작업 시작 금지. 브랜치 없이 main 직접 작업 금지.
- 머지는 항상 사용자 승인 후. Claude는 5단계(PR 생성)에서 멈춘다.
- 커밋 메시지는 항상 `(#이슈번호)` 포함.

──────────────────────────────────────────
