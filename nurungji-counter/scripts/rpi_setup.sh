#!/bin/bash
# rpi_setup.sh - 라즈베리 파이 초기 설정 스크립트 (최초 1회 실행)
# 사용법: bash rpi_setup.sh

set -e

GITHUB_REPO="durian0606/zego"
BRANCH="master"
PROJECT_DIR="$HOME/zego"
SERVICE_NAME="nurungji"

echo "========================================"
echo "  누룽지 카운팅 시스템 라즈베리 파이 설정"
echo "========================================"
echo ""

# ── Step 1: SSH 키 생성 ──────────────────────────────────────────────────────
echo "[1/7] SSH 키 확인..."
if [ ! -f "$HOME/.ssh/id_ed25519" ]; then
    echo "  SSH 키가 없습니다. 생성 중..."
    ssh-keygen -t ed25519 -C "pi-nurungji" -f "$HOME/.ssh/id_ed25519" -N ""
    echo "  SSH 키 생성 완료"
else
    echo "  기존 SSH 키 사용"
fi

echo ""
echo "  ★ 아래 공개 키를 GitHub에 등록하세요:"
echo "  GitHub → Settings → SSH and GPG keys → New SSH key"
echo ""
cat "$HOME/.ssh/id_ed25519.pub"
echo ""
read -p "  GitHub에 공개 키를 등록했으면 Enter를 누르세요..."

# ── Step 2: GitHub 연결 테스트 ───────────────────────────────────────────────
echo ""
echo "[2/7] GitHub 연결 테스트..."
if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
    echo "  GitHub 연결 성공"
else
    echo "  경고: GitHub 연결 확인 실패. 계속 진행합니다..."
fi

# ── Step 3: 레포지토리 clone ─────────────────────────────────────────────────
echo ""
echo "[3/7] 레포지토리 clone..."
if [ -d "$PROJECT_DIR" ]; then
    echo "  이미 존재합니다: $PROJECT_DIR (건너뜀)"
else
    git clone "https://github.com/$GITHUB_REPO.git" "$PROJECT_DIR"
    echo "  clone 완료: $PROJECT_DIR"
fi

# ── Step 4: pip 의존성 설치 ──────────────────────────────────────────────────
echo ""
echo "[4/7] Python 의존성 설치..."
cd "$PROJECT_DIR"
pip3 install --break-system-packages -r nurungji-counter/edge_device/requirements_edge.txt
echo "  의존성 설치 완료"

# ── Step 5: systemd 서비스 등록 ──────────────────────────────────────────────
echo ""
echo "[5/7] systemd 서비스 등록..."
sed "s|/home/pi/|$HOME/|g; s|User=pi|User=$(whoami)|g" "$PROJECT_DIR/nurungji-counter/systemd/$SERVICE_NAME.service" | sudo tee "/etc/systemd/system/$SERVICE_NAME.service" > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME.service"
echo "  서비스 등록 및 자동 시작 설정 완료"

# ── Step 6: sudo 권한 설정 (cron에서 systemctl 사용 가능하도록) ──────────────
echo ""
echo "[6/7] sudo 권한 설정..."
SUDOERS_FILE="/etc/sudoers.d/$SERVICE_NAME"
echo "$(whoami) ALL=(ALL) NOPASSWD: /bin/systemctl restart $SERVICE_NAME.service" | sudo tee "$SUDOERS_FILE" > /dev/null
sudo chmod 440 "$SUDOERS_FILE"
echo "  sudo 권한 설정 완료"

# ── Step 7: cron job 등록 (1분마다 동기화) ───────────────────────────────────
echo ""
echo "[7/7] cron job 등록 (1분마다 자동 동기화)..."
CRON_JOB="* * * * * bash $PROJECT_DIR/scripts/rpi_sync.sh >> $HOME/sync.log 2>&1"
# 이미 등록된 경우 중복 방지
if crontab -l 2>/dev/null | grep -qF "rpi_sync.sh"; then
    echo "  이미 등록되어 있습니다 (건너뜀)"
else
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "  cron job 등록 완료"
fi

# ── 서비스 시작 ──────────────────────────────────────────────────────────────
echo ""
echo "서비스 시작..."
sudo systemctl start "$SERVICE_NAME.service"
sleep 2
sudo systemctl status "$SERVICE_NAME.service" --no-pager

echo ""
echo "========================================"
echo "  설정 완료!"
echo "========================================"
echo ""
echo "  서비스 상태:  sudo systemctl status $SERVICE_NAME.service"
echo "  동기화 로그:  tail -f ~/sync.log"
echo "  수동 동기화:  bash $PROJECT_DIR/scripts/rpi_sync.sh"
echo ""
