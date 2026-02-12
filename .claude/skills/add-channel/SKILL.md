---
name: add-channel
description: 새 판매 채널 파서 추가 (스캐폴딩 + 가이드)
user-invocable: true
argument-hint: "<채널명>"
---

# Add Channel Agent

새로운 판매 채널 "$ARGUMENTS"을(를) choolgo-watcher에 추가합니다.

## 사전 조사

1. 주문 파일 샘플을 사용자에게 요청 (또는 감시 폴더에서 탐색)
2. 샘플 파일의 컬럼 구조 분석 (헤더 행, 데이터 시작 행)
3. 필요한 컬럼 매핑 파악:
   - 수령인명 / 수령자명 / 수취인
   - 전화번호 (수령자 vs 주문자 구분)
   - 주소 (우편번호 분리 여부)
   - 품목명
   - 수량
   - 메세지 (배송 메세지)

## 생성할 파일들

### 1. 채널 정의 추가
**파일**: `choolgo-watcher/config/channels.js`
- `CHANNELS` 배열에 새 채널 객체 추가
- `detectPattern`: 파일 경로/이름 매칭 패턴

### 2. 파서 생성
**파일**: `choolgo-watcher/parsers/<채널명>.js`
- 기존 파서 참조 (iwon.js가 가장 단순한 예시)
- `parse(filePath)` 함수 export
- 반환: `[{ product, quantity }]`

### 3. 컬럼 매핑 추가
**파일**: `choolgo-watcher/shipping/column-maps.js`
- `COLUMN_MAPS`에 새 채널 매핑 추가
- 필드: recipientName, phone, zipCode, address, message, productName, quantity

### 4. 감시 폴더 추가 (필요 시)
**파일**: `choolgo-watcher/config/config.js`
- `WATCH_SUBDIRS`에 새 하위 폴더 추가

## 테스트

1. 샘플 파일로 파서 단독 테스트: `node -e "require('./parsers/<채널명>').parse('<파일>')" `
2. shipping 추출 테스트
3. watcher 통합 테스트 (PM2 재시작 후 파일 추가)

## 기존 파서 참조

- `iwon.js`: 가장 단순 (고정 컬럼)
- `naver.js`: 암호화 파일 지원 (officecrypto-tool)
- `kakao.js`: 특수 컬럼 매핑
- `generic.js`: 자동 감지 (컬럼 키워드 검색)
