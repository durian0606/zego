# 이메일 자동 처리 설정 가이드

choolgo-watcher가 네이버 이메일을 자동으로 감시하여 주문서 첨부파일을 다운로드하고 처리합니다.

## 1. 네이버 이메일 설정

### 1.1 IMAP 활성화

1. 네이버 메일 접속
2. 설정 (⚙️) → POP3/IMAP 설정
3. IMAP/SMTP 설정 → **사용함** 선택
4. 저장

### 1.2 앱 비밀번호 생성

네이버는 보안을 위해 2단계 인증 사용 시 앱 비밀번호가 필요합니다.

1. [네이버 계정 관리](https://nid.naver.com/user2/help/myInfo?lang=ko_KR) 접속
2. **보안설정** 클릭
3. **2단계 인증** 활성화 (미설정 시)
4. **애플리케이션 비밀번호 관리** 클릭
5. 새 비밀번호 생성:
   - 애플리케이션 이름: `choolgo-watcher`
   - 생성 후 표시되는 **16자리 비밀번호** 복사 (다시 볼 수 없음)

## 2. 환경변수 파일 설정

### 2.1 .env 파일 생성

```bash
cd choolgo-watcher
cp .env.example .env
```

### 2.2 .env 파일 편집

```bash
nano .env
```

다음 내용을 입력:

```env
# 네이버 이메일 계정
NAVER_EMAIL=your-email@naver.com
NAVER_PASSWORD=your-16-digit-app-password

# IMAP 서버 설정 (기본값 사용 권장)
IMAP_HOST=imap.naver.com
IMAP_PORT=993
IMAP_TLS=true

# 이메일 폴링 설정
EMAIL_POLL_INTERVAL=60000      # 60초마다 새 메일 확인
EMAIL_CHECK_MAILBOX=INBOX      # 확인할 메일함
EMAIL_MARK_SEEN=true           # 처리 후 읽음 표시

# 첨부파일 임시 저장 경로
EMAIL_TEMP_DIR=./temp/email-attachments
```

**중요:** `.env` 파일은 절대 git에 커밋하지 마세요! (이미 `.gitignore`에 포함됨)

## 3. 발신자 규칙 설정

`email/sender-rules.js` 파일을 편집하여 발신자 이메일을 채널로 매핑합니다.

```javascript
const SENDER_RULES = [
  // 정확한 이메일 주소 매칭
  {
    pattern: 'order@iwon.com',        // 발신자 이메일
    channel: '아이원',                 // 채널명
    folder: '직택배',                  // 저장 폴더
    description: '아이원 자동 주문서'
  },

  // 도메인 매칭 (모든 @domain.com 이메일)
  {
    pattern: '@smartstore.naver.com',
    channel: '네이버',
    folder: '직택배',
    description: '네이버 스마트스토어'
  },

  // 키워드 매칭 (이메일에 특정 단어 포함)
  {
    pattern: 'kakao',
    channel: '카카오',
    folder: '카카오',
    description: '카카오 관련 이메일'
  },

  // 기본값 (매칭 실패 시)
  {
    pattern: '*',
    channel: '기타',
    folder: '직택배',
    description: '분류되지 않은 이메일'
  }
];
```

### 매칭 우선순위

1. **정확한 주소** → `order@company.com`
2. **도메인** → `@company.com`
3. **키워드** → `kakao` (이메일에 포함)
4. **기본값** → `*`

### 폴더 매핑

- `직택배` → `/volume1/우리곡간식품 동기화/07_출하관리.../07_CJ대한통운/직택배/`
- `카카오` → `/volume1/우리곡간식품 동기화/07_출하관리.../07_CJ대한통운/카카오/`
- `팔도감` → `/volume1/우리곡간식품 동기화/07_출하관리.../07_CJ대한통운/팔도감/`

## 4. 의존성 설치

```bash
cd choolgo-watcher
npm install
```

새로 추가된 패키지:
- `dotenv` - 환경변수 관리
- `imap` - IMAP 프로토콜 지원
- `mailparser` - 이메일 파싱

## 5. 테스트

### 5.1 수동 실행 (개발/테스트)

```bash
npm start
```

콘솔 출력 확인:
```
[이메일] IMAP 연결 시작: your-email@naver.com
[이메일] IMAP 연결 완료
[이메일] 메일함 열림: INBOX (123개 메시지)
```

### 5.2 테스트 메일 발송

1. 다른 이메일 계정에서 테스트 메일 발송
2. 발신자: `sender-rules.js`에 등록된 주소
3. 첨부파일: 엑셀 파일 (.xlsx, .xls)
4. 60초 이내 자동 처리 확인

### 5.3 로그 확인

```
[이메일] 읽지 않은 메일 1개 발견
[이메일] 처리 중: order@company.com | 주문서_20260220.xlsx | 첨부 1개
[이메일] 발신자: order@company.com → 채널: 아이원, 폴더: 직택배
[이메일] 저장 완료: /volume1/.../직택배/주문서_20260220_2026-02-20T10-30-00.xlsx
[이메일] 첨부파일 1개 저장 완료
```

## 6. PM2로 백그라운드 실행

```bash
npm run pm2:restart
npm run pm2:logs
```

## 7. 문제 해결

### IMAP 연결 실패

**증상:**
```
[이메일] IMAP 에러: Invalid credentials
[이메일] 30초 후 재연결 시도...
```

**해결:**
1. `.env` 파일의 `NAVER_EMAIL`, `NAVER_PASSWORD` 확인
2. 앱 비밀번호가 아닌 일반 비밀번호 사용 시 → 앱 비밀번호 재발급
3. IMAP 설정 활성화 확인

### 첨부파일 저장 실패

**증상:**
```
[이메일] 첨부파일 저장 실패: order.xlsx ENOENT: no such file or directory
```

**해결:**
1. 대상 폴더 존재 여부 확인
2. 폴더 권한 확인 (쓰기 가능 여부)
3. 디스크 공간 확인

### 메일을 처리하지 않음

**증상:**
- 새 메일이 왔지만 로그 없음

**해결:**
1. `EMAIL_CHECK_MAILBOX` 설정 확인 (기본값: `INBOX`)
2. 메일이 다른 폴더로 자동 분류되었는지 확인
3. `EMAIL_POLL_INTERVAL` 값 확인 (기본 60초)
4. `sender-rules.js`에 발신자 규칙 등록 확인

### 환경변수 미설정 경고

**증상:**
```
[이메일] NAVER_EMAIL 또는 NAVER_PASSWORD 미설정 → 이메일 감시 비활성화
```

**해결:**
- `.env` 파일이 있는지 확인
- `choolgo-watcher/` 폴더에 위치해야 함
- PM2 재시작: `npm run pm2:restart`

## 8. 보안 주의사항

### .env 파일 관리

- ❌ Git에 커밋 금지
- ❌ 다른 사람과 공유 금지
- ✅ 백업 시 암호화
- ✅ 서버 외부 유출 방지

### 앱 비밀번호 관리

- 정기적으로 재발급 (3-6개월)
- 유출 의심 시 즉시 삭제 후 재발급
- 여러 용도로 동일 비밀번호 재사용 금지

### 권한 제한

- 파일 시스템 권한 최소화
- 불필요한 메일함 접근 차단
- 로그 파일 권한 제한 (600)

## 9. 유지보수

### 임시 파일 정리

- 자동: 7일 이상 된 임시 파일 자동 삭제 (1시간마다)
- 수동: `rm -rf choolgo-watcher/temp/email-attachments/*`

### 로그 확인

```bash
# PM2 로그
npm run pm2:logs

# 파일 로그
tail -f choolgo-watcher/logs/watcher.log
```

### 상태 모니터링

```bash
npm run pm2:status
```

## 10. 추가 기능 아이디어

- [ ] 메일 제목 필터링 (특정 키워드 포함 메일만 처리)
- [ ] 첨부파일 파일명 패턴 검증 (잘못된 파일 거부)
- [ ] Slack/Discord 알림 (처리 완료 시 알림)
- [ ] 웹 대시보드 (처리된 메일 목록, 통계)
- [ ] 여러 이메일 계정 동시 감시

---

**문의:** 문제 발생 시 로그와 함께 이슈 등록
