---
name: diagnose
description: 시스템 문제 진단 - Firebase, watcher, 웹앱 이슈 분석
user-invocable: true
argument-hint: "[증상 설명]"
---

# Diagnose Agent

시스템 문제를 진단하고 해결 방안을 제시합니다.

## 증상: $ARGUMENTS

## 진단 절차

### 1. 시스템 상태 수집 (병렬 실행)
다음을 동시에 확인합니다:
- **PM2 상태**: `pm2 status` (watcher 프로세스 alive 여부)
- **API 서버**: `curl -s http://localhost:3100/api/health` (응답 여부)
- **실패 파일**: `curl -s http://localhost:3100/api/failed` (처리 실패 건)
- **디스크**: 감시 폴더 접근 가능 여부
- **최근 로그**: PM2 로그 최근 20줄

### 2. 증상별 심층 진단

**"재고가 안 맞아요"**
- Firebase `choolgoLogs/{오늘}/summary` 데이터 확인
- `processed.json` 최근 처리 파일 확인
- `failed.json` 실패 건 확인
- history 노드에서 최근 OUT 기록 교차 검증

**"파일이 처리 안 돼요"**
- 감시 폴더에 파일 존재 확인
- `processed.json`에 이미 등록 여부 확인
- 파일 날짜가 START_DATE(2026-02-08) 이후인지 확인
- 채널 감지 테스트: `detectChannel()` 결과 확인
- Excel 파일 읽기 테스트

**"웹앱이 느려요"**
- Firebase 리스너 수 확인 (app.js)
- products 노드 데이터 크기 확인
- history 노드 크기 확인 (limitToLast 적용 여부)
- 브라우저 콘솔 에러 확인 안내

**"택배양식이 안 나와요"**
- 택배양식 출력 폴더 확인
- shipping/pending.json 존재 여부
- column-maps.js에 해당 채널 매핑 존재 여부
- 품목명 매핑 규칙 확인 (Firebase productNameMappings)

### 3. 해결 방안 제시

진단 결과를 바탕으로:
1. 즉시 실행 가능한 해결 명령어 제시
2. 근본 원인 분석
3. 재발 방지 방안 제안

## 주요 경로
- watcher: `/volume1/web/dev/zego/choolgo-watcher/`
- 웹앱: `/volume1/web/dev/zego/docs/`
- 감시 폴더: `/volume1/우리곡간식품 동기화/07_출하관리                             출하팀장/07_CJ대한통운/`
- processed.json: `/volume1/web/dev/zego/choolgo-watcher/processed.json`
- failed.json: `/volume1/web/dev/zego/choolgo-watcher/failed.json`
