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
4. `public/firebase-config.js`에 설정값 붙여넣기

### 2. 실행

```bash
# public 폴더의 index.html을 더블클릭하여 브라우저로 열기
# 또는
cd public
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
├── public/                    # 웹 앱 (이 폴더만 있으면 됨!)
│   ├── index.html            # 메인 페이지
│   ├── app.js                # Firebase 연동 로직
│   ├── style.css             # 스타일
│   └── firebase-config.js    # Firebase 설정 (수정 필요!)
├── FIREBASE_SETUP.md         # Firebase 설정 가이드
└── README.md                 # 이 파일

# 참고: Python 버전 (레거시)
├── app.py                    # Flask 서버 (사용 안 함)
├── database.py               # SQLite DB (사용 안 함)
└── templates/                # 구버전 템플릿 (사용 안 함)
```

## 🎨 화면 구성

- **헤더**: 제목 + 연결 상태
- **바코드 스캔**: 바코드 입력 + 입고/출고 버튼
- **제품 등록**: 새 제품 추가 폼
- **재고 현황**: 전체 제품 재고 현황 테이블
- **변동 히스토리**: 최근 50개 입출고 기록

## 🔥 Firebase vs Python 버전 비교

| 기능 | Firebase 버전 | Python 버전 |
|------|--------------|------------|
| 서버 실행 | 불필요 | 필요 |
| 외부 접속 | 쉬움 (Firebase Hosting) | 어려움 (포트포워딩 필요) |
| 실시간 동기화 | 자동 | WebSocket 구현 필요 |
| 데이터베이스 | Firebase Realtime DB | SQLite |
| 배포 | HTML 파일만 | 서버 필요 |
| 비용 | 무료 | 호스팅 비용 발생 가능 |

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
