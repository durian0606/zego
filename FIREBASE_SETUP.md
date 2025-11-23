# Firebase 설정 가이드

## 1. Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. "프로젝트 추가" 클릭
3. 프로젝트 이름 입력 (예: `barcode-inventory`)
4. Google 애널리틱스는 선택사항 (비활성화 가능)
5. "프로젝트 만들기" 클릭

## 2. Realtime Database 생성

1. Firebase 프로젝트 대시보드에서 좌측 메뉴 **"빌드"** → **"Realtime Database"** 클릭
2. **"데이터베이스 만들기"** 클릭
3. 위치 선택: **"asia-southeast1"** (싱가포르) 또는 가까운 지역
4. 보안 규칙 선택: **"테스트 모드에서 시작"** 선택
   ```
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
   > ⚠️ 주의: 테스트 모드는 누구나 읽고 쓸 수 있습니다. 실제 운영시 보안 규칙을 수정하세요.

5. **"사용 설정"** 클릭

## 3. Firebase 설정값 가져오기

1. Firebase 프로젝트 대시보드에서 좌측 상단 **⚙️ (설정)** 아이콘 클릭
2. **"프로젝트 설정"** 클릭
3. 아래로 스크롤하여 **"내 앱"** 섹션 찾기
4. **"웹 앱에 Firebase 추가"** 클릭 (</> 아이콘)
5. 앱 닉네임 입력 (예: `Barcode Inventory Web`)
6. **"Firebase 호스팅도 설정"** 체크 해제
7. **"앱 등록"** 클릭
8. **Firebase 설정 객체** 복사:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "barcode-inventory-xxxxx.firebaseapp.com",
     databaseURL: "https://barcode-inventory-xxxxx-default-rtdb.firebaseio.com",
     projectId: "barcode-inventory-xxxxx",
     storageBucket: "barcode-inventory-xxxxx.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef"
   };
   ```

## 4. 프로젝트에 설정값 적용

1. `public/firebase-config.js` 파일 열기
2. 복사한 설정값으로 교체:
   ```javascript
   const firebaseConfig = {
       // 여기에 복사한 설정값 붙여넣기
       apiKey: "YOUR_API_KEY",
       authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
       databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
       projectId: "YOUR_PROJECT_ID",
       storageBucket: "YOUR_PROJECT_ID.appspot.com",
       messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
       appId: "YOUR_APP_ID"
   };

   firebase.initializeApp(firebaseConfig);
   ```
3. 파일 저장

## 5. 실행하기

### 방법 1: 로컬에서 바로 실행 (가장 간단!)

1. `public/index.html` 파일을 **더블클릭**하여 브라우저로 열기
2. 끝! 바로 사용 가능합니다.

### 방법 2: 로컬 웹서버로 실행

```bash
cd public
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000` 접속

### 방법 3: Firebase Hosting에 배포 (외부 접속 가능!)

```bash
# Firebase CLI 설치 (한 번만)
npm install -g firebase-tools

# 로그인
firebase login

# 프로젝트 초기화
firebase init hosting

# 배포
firebase deploy
```

배포 후 제공되는 URL로 **전세계 어디서든** 접속 가능!

예: `https://barcode-inventory-xxxxx.web.app`

## 6. 보안 규칙 강화 (선택사항)

테스트 후 보안 규칙을 강화하세요:

Firebase Console → Realtime Database → **"규칙"** 탭:

```json
{
  "rules": {
    "products": {
      ".read": true,
      ".write": true,
      "$barcode": {
        ".validate": "newData.hasChildren(['barcode', 'name', 'currentStock', 'minStock'])"
      }
    },
    "history": {
      ".read": true,
      ".write": true
    }
  }
}
```

## 7. 샘플 데이터 추가

Firebase Console → Realtime Database → **"데이터"** 탭에서 직접 추가하거나,
웹 UI에서 "제품 등록" 섹션을 이용해 제품을 추가하세요.

## 문제 해결

### "Permission denied" 오류
- Realtime Database 보안 규칙이 테스트 모드인지 확인
- `firebase-config.js`의 `databaseURL`이 정확한지 확인

### 연결 안 됨
- 브라우저 개발자 도구(F12) → Console에서 오류 확인
- `firebase-config.js` 설정값이 올바른지 확인
- 인터넷 연결 확인

### CORS 오류 (로컬 파일 실행 시)
- 로컬 웹서버를 사용하세요 (`python3 -m http.server 8000`)

## 완료!

이제 모니터에 띄워놓고 바코드를 스캔하면 실시간으로 재고가 업데이트됩니다! 🎉

여러 기기에서 동시에 접속해도 모두 실시간으로 동기화됩니다.
