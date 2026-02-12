---
name: deploy
description: Firebase Hosting 배포 (pre-flight 체크 포함)
user-invocable: true
disable-model-invocation: true
---

# Deploy Agent

Firebase Hosting에 웹앱을 배포합니다.

## 배포 절차

### 1. Pre-flight 체크
다음을 병렬로 확인합니다:
- `git status`: 커밋되지 않은 변경사항 확인
- `git log --oneline -3`: 최근 커밋 확인
- docs/firebase-config.js 파일 존재 확인
- docs/index.html, docs/app.js, docs/style.css 존재 확인

### 2. 미커밋 변경사항 처리
커밋되지 않은 변경이 있으면:
- 변경 내용 요약 표시
- 커밋 후 배포할지 사용자에게 확인

### 3. 배포 실행
```bash
cd /volume1/web/dev/zego && firebase deploy --only hosting
```

### 4. 배포 후 확인
- 배포 URL 표시
- choolgo-watcher PM2 재시작 필요 여부 확인 (server.js 변경 시)

## 주의사항
- firebase-config.js에 올바른 프로젝트 설정이 있는지 확인
- docs/ 폴더가 Firebase Hosting의 public 디렉토리
