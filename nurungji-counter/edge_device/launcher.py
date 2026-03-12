"""
누룽지 카운팅 시스템 - 런처 데몬

항상 백그라운드에서 실행되며 Firebase devicePower 상태에 따라
main.py를 자동으로 시작/종료합니다.

설치 방법 (라즈베리 파이에서 한 번만):
    sudo cp nurungji-launcher.service /etc/systemd/system/
    sudo systemctl enable nurungji-launcher
    sudo systemctl start nurungji-launcher

동작 원리:
    zego "생산 시작" → Firebase devicePower = "on"  → main.py 자동 시작
    zego "생산 종료" → Firebase devicePower = "off" → main.py 자동 종료
"""

import time
import subprocess
import os
import signal
import sys

# 같은 디렉토리의 firebase_client 사용
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import firebase_client

POLL_INTERVAL = 5  # Firebase 폴링 간격 (초)
MAIN_PY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py")

_proc = None  # main.py 서브프로세스


def _is_running():
    """main.py가 현재 실행 중인지 확인"""
    return _proc is not None and _proc.poll() is None


def start_main():
    """main.py 시작"""
    global _proc
    if _is_running():
        return
    print("[런처] main.py 시작 중...")
    _proc = subprocess.Popen([sys.executable, MAIN_PY])
    print(f"[런처] main.py PID={_proc.pid} 시작됨")


def stop_main():
    """main.py 종료"""
    global _proc
    if not _is_running():
        _proc = None
        return
    print(f"[런처] main.py PID={_proc.pid} 종료 중...")
    _proc.terminate()
    try:
        _proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        _proc.kill()
        _proc.wait()
    _proc = None
    firebase_client.set_device_stopped()
    print("[런처] main.py 종료됨")


def run():
    """메인 폴링 루프"""
    print("=" * 40)
    print("누룽지 카운팅 런처 시작")
    print(f"main.py 경로: {MAIN_PY}")
    print("=" * 40)

    while True:
        try:
            power = firebase_client.get_device_power()

            if power == "on":
                if not _is_running():
                    start_main()
            else:
                # "off" 또는 값 없음 → 실행 중이면 종료
                if _is_running():
                    stop_main()

            # 예기치 않은 크래시 감지 (전원은 "on"인데 프로세스가 죽은 경우)
            if _proc is not None and _proc.poll() is not None:
                exit_code = _proc.poll()
                print(f"[런처] ⚠️  main.py 비정상 종료 (코드: {exit_code})")
                firebase_client._firebase_patch(
                    "edgeDevice", {"status": "crashed", "lastSeen": firebase_client._now_ms()}
                )
                _proc = None

        except Exception as e:
            print(f"[런처] 오류: {e}")

        time.sleep(POLL_INTERVAL)


def _signal_handler(sig, frame):
    print("\n[런처] 종료 신호 수신 - main.py도 함께 종료합니다")
    stop_main()
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)
    run()
