#!/bin/bash
# rpi_sync.sh - GitHub에서 최신 코드를 자동으로 pull하는 동기화 스크립트
# crontab에서 1분마다 실행: * * * * * bash ~/zego/nurungji-counter/scripts/rpi_sync.sh >> ~/sync.log 2>&1

PROJECT_DIR="/home/durian0606/zego"
BRANCH="master"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

cd "$PROJECT_DIR" || {
    echo "$LOG_PREFIX 오류: 프로젝트 디렉토리 없음 ($PROJECT_DIR)"
    exit 1
}

# 원격 변경사항 확인
git fetch origin "$BRANCH" --quiet 2>&1

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

# 변경사항 없으면 조용히 종료
if [ "$LOCAL" = "$REMOTE" ]; then
    exit 0
fi

echo "$LOG_PREFIX 변경사항 감지 (${LOCAL:0:7} → ${REMOTE:0:7}), 동기화 시작..."
git pull origin "$BRANCH"

# requirements_edge.txt 변경 시 pip 재설치
if git diff "$LOCAL" HEAD --name-only | grep -q "requirements_edge.txt"; then
    echo "$LOG_PREFIX 의존성 변경 감지, pip 재설치 중..."
    pip3 install -r nurungji-counter/edge_device/requirements_edge.txt
fi

# nurungji 서비스 재시작
sudo systemctl restart nurungji.service
echo "$LOG_PREFIX 동기화 완료, 서비스 재시작됨"
