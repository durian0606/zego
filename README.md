# 바코드 재고관리 시스템 🚀

**Firebase 기반** 실시간 바코드 스캐너 재고관리 프로그램입니다.

서버 없이 HTML 파일만 열면 바로 사용 가능! 외부 어디서든 접속 가능!

## ✨ 주요 특징

- ✅ **서버 불필요** - HTML 파일만 열면 바로 실행
- ✅ **외부 접속 가능** - Firebase Hosting으로 전세계 어디서든 접속
- ✅ **실시간 동기화** - 여러 기기에서 동시 사용 가능
- ✅ **바코드 스캔** - 입고/출고 처리
- ✅ **재고 현황** - 실시간 업데이트
- ✅ **변동 히스토리** - 모든 입출고 기록
- ✅ **최소 재고 알림** - 재고 부족 시 자동 표시
- ✅ **무료** - Firebase 무료 플랜 사용

## 🚀 빠른 시작

### 1. Firebase 설정 (5분 소요)

자세한 설정 방법은 [FIREBASE_SETUP.md](FIREBASE_SETUP.md) 참고

**간단 요약:**
1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트 생성
2. Realtime Database 활성화 (테스트 모드)
3. 웹 앱 등록 후 설정값 복사
4. `docs/firebase-config.js`에 설정값 붙여넣기

### 2. 실행

```bash
# docs 폴더의 index.html을 더블클릭하여 브라우저로 열기
# 또는
cd docs
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

### 3. 외부 접속 (선택사항)

Firebase Hosting에 배포하면 전세계 어디서든 접속 가능:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

배포 후: `https://your-project.web.app`

## 📱 사용 방법

### 1. 제품 등록
- "제품 등록" 섹션에서 바코드, 제품명, 설명, 최소 재고 입력
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
- 실시간 자동 업데이트
- 최소 재고 이하일 경우 "부족" 표시

## 📂 프로젝트 구조

```
zego/
├── docs/                      # 웹 앱 (이 폴더만 있으면 됨!)
│   ├── index.html            # 메인 페이지
│   ├── app.js                # Firebase 연동 로직
│   ├── chulha-browser.js     # 택배양식 생성
│   ├── style.css             # 스타일
│   └── firebase-config.js    # Firebase 설정 (수정 필요!)
├── choolgo-watcher/          # 출하관리 파일 감시 서비스
│   ├── email/                # 이메일 자동 처리 모듈
│   │   ├── imap-watcher.js   # IMAP 메일 감시
│   │   ├── attachment-handler.js  # 첨부파일 처리
│   │   └── sender-rules.js   # 발신자 → 채널 매핑
│   ├── .env.example          # 환경변수 템플릿
│   └── EMAIL_SETUP.md        # 이메일 설정 가이드
├── FIREBASE_SETUP.md         # Firebase 설정 가이드
└── README.md                 # 이 파일
```

## 📧 choolgo-watcher (출하관리 자동화)

주문 엑셀 파일을 자동으로 처리하고 Firebase에 출고 데이터를 업데이트하는 백그라운드 서비스입니다.

### 주요 기능

1. **파일 감시**: 지정 폴더의 새 엑셀 파일 자동 감지
2. **채널 자동 분류**: 파일 경로/이름으로 판매 채널 감지 (아이원, 네이버, 카카오, 팔도감 등)
3. **재고 차감**: Firebase에서 자동으로 재고 차감
4. **택배양식 생성**: 중복 제거 후 CJ대한통운 택배양식 자동 생성
5. **📧 이메일 자동 처리 (NEW)**: 네이버 이메일 감시 → 첨부 엑셀 자동 다운로드 → 처리

### 설치 및 실행

```bash
cd choolgo-watcher
npm install
npm run pm2:start   # 백그라운드 실행
npm run pm2:logs    # 로그 확인
npm run pm2:stop    # 중지
```

### 이메일 자동 처리 설정

네이버 이메일로 오는 주문서를 자동으로 다운로드하고 처리할 수 있습니다.

**설정 방법:**
1. `.env.example`을 복사하여 `.env` 파일 생성
2. 네이버 이메일 계정 및 앱 비밀번호 입력
3. `email/sender-rules.js`에서 발신자 → 채널 매핑 설정
4. PM2 재시작: `npm run pm2:restart`

자세한 설정 방법은 [choolgo-watcher/EMAIL_SETUP.md](choolgo-watcher/EMAIL_SETUP.md) 참고

**작동 방식:**
```
이메일 도착 (엑셀 첨부)
  ↓
발신자 주소로 채널 자동 분류
  ↓
지정 폴더에 첨부파일 저장
  ↓
choolgo-watcher가 자동 처리
  ↓
Firebase 재고 차감 + 택배양식 생성
```

## 🎨 화면 구성

- **헤더**: 제목 + 연결 상태
- **바코드 스캔**: 바코드 입력 + 입고/출고 버튼
- **제품 등록**: 새 제품 추가 폼
- **재고 현황**: 전체 제품 재고 현황 테이블
- **변동 히스토리**: 최근 50개 입출고 기록

## 💡 사용 팁

### 모니터에 띄워두고 사용하기
1. 브라우저 전체화면 모드 (F11)
2. 바코드 스캐너로 제품 스캔
3. 자동으로 입고 처리됨 (엔터키 자동 입력되는 스캐너)

### 여러 기기에서 동시 사용
- PC: 재고 현황 모니터링
- 태블릿/모바일: 바코드 스캔으로 입출고 처리
- 모든 기기에 실시간 반영!

## 🔒 보안 주의사항

현재 설정은 테스트 모드로 누구나 읽고 쓸 수 있습니다.

실제 운영 시 Firebase 보안 규칙을 강화하세요.
자세한 내용은 [FIREBASE_SETUP.md](FIREBASE_SETUP.md) 참고

## 📝 데이터 구조

### products (제품)
```json
{
  "8801234567890": {
    "barcode": "8801234567890",
    "name": "노트북",
    "description": "LG 그램 14인치",
    "currentStock": 10,
    "minStock": 5,
    "createdAt": 1234567890000,
    "updatedAt": 1234567890000
  }
}
```

### history (히스토리)
```json
{
  "-NxxXxXxXxXxXxXx": {
    "productName": "노트북",
    "barcode": "8801234567890",
    "type": "IN",
    "quantity": 10,
    "beforeStock": 0,
    "afterStock": 10,
    "timestamp": 1234567890000
  }
}
```

## 🛠️ 기술 스택

- **프론트엔드**: HTML, CSS, JavaScript (바닐라)
- **백엔드**: Firebase Realtime Database
- **호스팅**: Firebase Hosting (선택사항)
- **실시간 통신**: Firebase SDK

## 📞 문제 해결

문제가 발생하면 [FIREBASE_SETUP.md](FIREBASE_SETUP.md)의 "문제 해결" 섹션을 참고하세요.

## 📄 라이선스

MIT

---

**워크리스트처럼 간편하게!** HTML 파일만 열면 바로 사용 가능합니다! 🎉
