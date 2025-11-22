# 바코드 재고관리 시스템

실시간 바코드 스캐너 재고관리 프로그램입니다.

## 기능

- ✅ 바코드 스캔으로 입고/출고 처리
- ✅ 실시간 재고 현황 업데이트 (WebSocket)
- ✅ 제품 등록 및 관리
- ✅ 재고 변동 히스토리 기록
- ✅ 최소 재고 알림
- ✅ 웹 기반 UI

## 설치 방법

1. 필요한 패키지 설치:
```bash
pip3 install -r requirements.txt
```

## 실행 방법

1. 서버 시작:
```bash
python3 app.py
```

2. 웹 브라우저에서 접속:
```
http://localhost:5000
```

## 사용 방법

### 1. 제품 등록
- "제품 등록" 섹션에서 바코드, 제품명, 설명, 최소 재고를 입력
- "제품 등록" 버튼 클릭

### 2. 입고 처리
- 바코드 입력란에 바코드 입력 (스캐너 또는 키보드)
- 수량 입력
- "입고" 버튼 클릭 (또는 엔터키)

### 3. 출고 처리
- 바코드 입력란에 바코드 입력
- 수량 입력
- "출고" 버튼 클릭

### 4. 재고 현황 확인
- 실시간으로 자동 업데이트
- 최소 재고 이하일 경우 "부족" 표시

## 샘플 데이터 추가

샘플 제품을 추가하려면:
```bash
python3 add_sample_data.py
```

## 파일 구조

```
zego/
├── app.py                 # Flask 메인 서버
├── database.py            # 데이터베이스 관리
├── requirements.txt       # Python 패키지 의존성
├── inventory.db           # SQLite 데이터베이스 (자동 생성)
├── templates/
│   └── index.html         # 메인 웹 페이지
└── static/
    ├── css/
    │   └── style.css      # 스타일시트
    └── js/
        └── app.js         # 프론트엔드 JavaScript
```

## 데이터베이스 스키마

### products 테이블
- id: 제품 ID (자동 증가)
- barcode: 바코드 (고유)
- name: 제품명
- description: 설명
- current_stock: 현재 재고
- min_stock: 최소 재고
- created_at: 생성일시
- updated_at: 수정일시

### inventory_history 테이블
- id: 히스토리 ID (자동 증가)
- product_id: 제품 ID
- barcode: 바코드
- transaction_type: 거래 유형 (IN/OUT)
- quantity: 수량
- before_stock: 이전 재고
- after_stock: 이후 재고
- note: 메모
- created_at: 생성일시

## 기술 스택

- **백엔드**: Python, Flask, Flask-SocketIO
- **프론트엔드**: HTML, CSS, JavaScript, Socket.IO
- **데이터베이스**: SQLite
- **실시간 통신**: WebSocket

## 라이선스

MIT
