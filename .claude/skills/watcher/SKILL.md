---
name: watcher
description: choolgo-watcher 상태 확인, 재시작, 실패 파일 관리
user-invocable: true
argument-hint: "[status|restart|logs|failed|retry]"
---

# choolgo-watcher Management Agent

choolgo-watcher 서비스를 관리합니다.

## 명령어: $ARGUMENTS

인자에 따라 다음 작업을 수행합니다:

### `status` (기본값, 인자 없을 때)
1. `pm2 status` 실행하여 watcher 프로세스 상태 확인
2. `curl http://localhost:3100/api/health` 로 API 서버 상태 확인
3. `curl http://localhost:3100/api/failed` 로 실패 파일 목록 확인
4. 결과를 한눈에 보기 좋게 요약

### `restart`
1. `cd /volume1/web/dev/zego/choolgo-watcher && npm run pm2:restart`
2. 재시작 후 상태 확인
3. 최근 로그 5줄 표시

### `logs`
1. `cd /volume1/web/dev/zego/choolgo-watcher && npm run pm2:logs -- --lines 30`
2. 에러가 있으면 원인 분석 및 해결 방안 제시

### `failed`
1. `curl http://localhost:3100/api/failed` 로 실패 목록 조회
2. 각 실패 건의 에러 코드와 원인 분석
3. 재처리 가능 여부 판단 및 안내

### `retry`
1. 실패 목록 조회
2. 각 실패 파일에 대해 `POST /api/retry-failed` 호출 여부를 사용자에게 확인
3. 재처리 실행 및 결과 보고

## 주요 경로
- watcher 디렉토리: `/volume1/web/dev/zego/choolgo-watcher`
- 감시 폴더: `/volume1/우리곡간식품 동기화/07_출하관리                             출하팀장/07_CJ대한통운/`
- 하위: `직택배/`, `카카오/`, `팔도감/`
- API: `http://localhost:3100`
