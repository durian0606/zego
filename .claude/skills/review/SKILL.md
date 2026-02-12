---
name: review
description: 코드 리뷰 - 보안, 성능, Firebase 패턴 검증
user-invocable: true
argument-hint: "[파일경로 또는 변경 설명]"
---

# Code Review Agent

프로젝트 컨텍스트를 기반으로 코드를 리뷰합니다.

## 리뷰 대상

$ARGUMENTS

인자가 없으면 `git diff HEAD~1` 기준으로 최근 변경사항을 리뷰합니다.

## 리뷰 체크리스트

### 보안 (Critical)
- XSS: innerHTML 사용 시 사용자 입력 이스케이프 여부
- Firebase: 보안 규칙 우회 가능성 (직접 URL 접근 등)
- Path Traversal: 파일 경로에 사용자 입력이 포함되는 경우
- Command Injection: child_process, exec 사용 여부

### Firebase 패턴
- 리스너 정리: `off()` 호출 여부 (메모리 누수 방지)
- 원자적 업데이트: multi-path update 사용 여부 (데이터 정합성)
- 에러 처리: Firebase 호출 실패 시 fallback 존재 여부
- 쿼리 효율: `limitToLast()`, 인덱싱 적절성

### 성능
- O(n^2) 이상 알고리즘 존재 여부
- 불필요한 DOM 리렌더링 (전체 테이블 재생성 등)
- Firebase 리스너가 과도하게 트리거되는 패턴

### 프로젝트 규칙
- AppState 일관성 유지
- 바코드 입력 포커스 관리 영향
- 한글 UI 텍스트 사용
- camelCase 네이밍

## 출력 형식

변경 파일별로 아래 형식으로 리뷰 결과를 출력합니다:

```
### 파일명.js

- [CRITICAL] 설명 (line XX)
- [WARNING] 설명 (line XX)
- [GOOD] 잘 작성된 부분
- [TIP] 선택적 개선 아이디어
```

마지막에 전체 요약과 승인/수정필요 판정을 내립니다.
