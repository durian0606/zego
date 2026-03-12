"""
누룽지 생산량 카운팅 시스템 - 카메라 미리보기 스크립트
MQTT/Firebase 없이 카메라 + MJPEG 서버만 단독으로 구동

실행법: cd ~/edge_device && python3 camera_preview.py
접속법: http://localhost:8080/stream  (또는 http://<라즈베리파이IP>:8080/stream)
종료법: Ctrl+C
"""

import signal
import sys
import time

from camera_capture import CameraCapture
from mjpeg_server import MJPEGServer

CAPTURE_INTERVAL = 0.1  # 초 (약 10fps)


def main():
    camera = None
    server = None

    def shutdown(signum=None, frame=None):
        print("\n[Preview] 종료 중...")
        if server:
            server.stop()
        if camera:
            camera.close()
        print("[Preview] 종료 완료")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print("[Preview] 카메라 미리보기 시작")

    try:
        camera = CameraCapture()
    except Exception as e:
        print(f"[Preview] 카메라 초기화 실패: {e}")
        sys.exit(1)

    server = MJPEGServer(
        get_calibration_mode=lambda: True,
        get_latest_boxes=lambda: [],
    )
    server.start()

    print("[Preview] 접속 URL:")
    print("  http://localhost:8080/stream")
    print("  http://localhost:8080/snapshot")
    print("[Preview] 종료: Ctrl+C")

    while True:
        frame = camera.capture_frame()
        if frame is not None:
            server.push_frame(frame, boxes=[])
        time.sleep(CAPTURE_INTERVAL)


if __name__ == "__main__":
    main()
