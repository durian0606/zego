---
name: ship
description: 출하실장 호출 - 에이전트 조율, 자동 커밋/푸시, 문서 관리
user-invocable: true
argument-hint: "[작업 설명]"
---

# Shipping Manager (출하실장) Agent Launcher

출하실장 에이전트를 호출하여 복잡한 작업을 조율하고 자동으로 커밋/푸시합니다.

## 작업 요청: $ARGUMENTS

인자가 없으면 "현재 상태 점검 및 필요한 작업 제안"을 수행합니다.

## 출하실장이 하는 일

1. **에이전트 조율**: 다른 에이전트들에게 작업 위임 및 결과 통합
2. **자동 Git 관리**: 작업 완료 후 자동 커밋/푸시 (사용자 선호도에 따라)
3. **문서 관리**: MEMORY.md, CLAUDE.md 등 프로젝트 문서 최신화
4. **품질 보증**: 코드 리뷰, 테스트, 보안 검증

## 사용 예시

### 새 기능 추가
```
/ship 채널별 출고 통계 그래프 추가해줘
```
→ database-architect + code-assistant + web-designer 조율 → 코드 리뷰 → 테스트 → 커밋/푸시

### 전체 리뷰
```
/ship 전체 코드 리뷰하고 개선점 찾아줘
```
→ explore + code-reviewer → 개선사항 정리 → 사용자 승인 후 개선 → 커밋/푸시

### 문서 업데이트
```
/ship MEMORY.md에 오늘 배운 내용 정리해줘
```
→ MEMORY.md 읽기 → 새 내용 추가 → 커밋/푸시

### 버그 수정
```
/ship 품목명 매핑 안 되는 버그 고쳐줘
```
→ explore로 원인 찾기 → code-assistant로 수정 → tester로 검증 → MEMORY.md 교훈 기록 → 커밋/푸시

### 상태 점검
```
/ship
```
→ git 상태, watcher 상태, 문서 최신화 여부 확인 → 필요한 작업 제안

## 출하실장의 자동화

- ✅ **자동 커밋/푸시**: 모든 대대적인 작업 완료 후 자동 실행
- ✅ **자동 문서화**: 패턴 발견 시 MEMORY.md/CLAUDE.md 자동 업데이트
- ✅ **자동 리뷰**: 코드 변경 시 보안/성능 자동 검증
- ✅ **이슈 즉시 수정**: 문제 발견 시 물어보지 않고 바로 수정

## 팀원 에이전트

출하실장이 조율하는 에이전트들:
- `code-assistant`: 코드 작성, 기능 구현, 버그 수정
- `backend-developer`: Node.js, choolgo-watcher, Excel 처리
- `web-designer`: UI/UX 개선, 스타일링
- `code-reviewer`: 코드 리뷰, 보안 검증
- `tester`: 테스트 케이스 작성, 검증
- `performance-optimizer`: 성능 최적화
- `database-architect`: Firebase 데이터 구조 설계

## 주의사항

- 출하실장은 **사용자 요청 없이도** 작업 완료 후 자동 커밋/푸시합니다 (User Preferences에 따라)
- 커밋을 원하지 않으면 "커밋하지 마" 명시적으로 요청하세요
- 문서 업데이트는 중요한 패턴/교훈 발견 시 자동으로 수행됩니다

---

**출하실장 좌우명:**
> "빠르게 실행하고, 완벽하게 마무리하고, 안전하게 배포한다." 🚀

이제 Task 도구로 shipping-manager 에이전트를 호출합니다.
