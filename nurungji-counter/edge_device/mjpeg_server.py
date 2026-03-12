"""
누룽지 생산량 카운팅 시스템 - MJPEG 스트리밍 서버
포트 8080에서 MJPEG HTTP 스트림 제공 (브라우저 img 태그로 직접 표시 가능)

엔드포인트:
  GET /stream   → multipart/x-mixed-replace MJPEG 스트림
  GET /snapshot → 최신 프레임 JPEG 1장
"""

import io
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import cv2
import numpy as np

MJPEG_PORT = 8080
STREAM_BOUNDARY = b"--mjpeg-boundary"


class FrameBuffer:
    """최신 프레임(JPEG bytes)을 thread-safe하게 보관"""

    def __init__(self):
        self._lock = threading.Lock()
        self._jpeg = None
        self._condition = threading.Condition(self._lock)

    def update(self, jpeg_bytes):
        with self._condition:
            self._jpeg = jpeg_bytes
            self._condition.notify_all()

    def get_latest(self):
        with self._lock:
            return self._jpeg

    def wait_for_next(self, timeout=5.0):
        with self._condition:
            self._condition.wait(timeout=timeout)
            return self._jpeg


# 전역 프레임 버퍼 (mjpeg_server 모듈 내에서 공유)
frame_buffer = FrameBuffer()


def encode_frame(frame, boxes, show_overlay):
    """
    numpy RGB 프레임을 JPEG bytes로 인코딩.
    show_overlay=True 이면 바운딩 박스 + 개수 오버레이 추가.

    Args:
        frame (numpy.ndarray): RGB 이미지
        boxes (list): 감지된 바운딩 박스 목록
        show_overlay (bool): 오버레이 표시 여부

    Returns:
        bytes | None: JPEG bytes
    """
    if frame is None:
        return None

    try:
        # RGB → BGR (OpenCV)
        bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

        if show_overlay and boxes:
            for obj in boxes:
                x, y, w, h = obj["x"], obj["y"], obj["w"], obj["h"]
                cv2.rectangle(bgr, (x, y), (x + w, y + h), (0, 255, 0), 2)
                label = f"{obj.get('area', '')} px²"
                cv2.putText(bgr, label, (x, max(y - 6, 10)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1,
                            cv2.LINE_AA)

        if show_overlay:
            count_text = f"Count: {len(boxes) if boxes else 0}"
            cv2.putText(bgr, count_text, (10, 36),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 2,
                        cv2.LINE_AA)

        ok, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, 75])
        if not ok:
            return None
        return buf.tobytes()

    except Exception as e:
        print(f"[MJPEG] 인코딩 오류: {e}")
        return None


class MJPEGHandler(BaseHTTPRequestHandler):
    """HTTP 요청 핸들러"""

    # 공유 상태 (서버 인스턴스에서 주입)
    get_calibration_mode = None  # callable: () -> bool
    get_latest_boxes = None      # callable: () -> list

    def log_message(self, format, *args):
        # 기본 로그 억제 (과도한 출력 방지)
        pass

    def do_GET(self):
        if self.path in ("/stream", "/stream/"):
            self._handle_stream()
        elif self.path in ("/snapshot", "/snapshot/"):
            self._handle_snapshot()
        else:
            self.send_error(404)

    def _handle_stream(self):
        self.send_response(200)
        self.send_header("Content-Type",
                         f"multipart/x-mixed-replace; boundary=mjpeg-boundary")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        try:
            while True:
                jpeg = frame_buffer.wait_for_next(timeout=5.0)
                if jpeg is None:
                    time.sleep(0.1)
                    continue

                header = (
                    STREAM_BOUNDARY + b"\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n"
                )
                try:
                    self.wfile.write(header + jpeg + b"\r\n")
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    break
        except Exception:
            pass

    def _handle_snapshot(self):
        jpeg = frame_buffer.get_latest()
        if jpeg is None:
            self.send_error(503, "No frame available yet")
            return

        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(jpeg)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(jpeg)


class MJPEGServer:
    """
    MJPEG 스트리밍 서버.
    별도 데몬 스레드에서 실행되며, main.py 의 메인 루프와 프레임을 공유.

    사용법:
        server = MJPEGServer(
            get_calibration_mode=lambda: self._calibration_mode,
            get_latest_boxes=lambda: self._latest_boxes
        )
        server.start()
        # 새 프레임마다:
        server.push_frame(frame, boxes)
    """

    def __init__(self, get_calibration_mode=None, get_latest_boxes=None):
        """
        Args:
            get_calibration_mode (callable): 현재 캘리브레이션 모드 여부를 반환하는 함수
            get_latest_boxes (callable): 최신 바운딩 박스 목록을 반환하는 함수
        """
        self._get_calibration_mode = get_calibration_mode or (lambda: False)
        self._get_latest_boxes = get_latest_boxes or (lambda: [])
        self._server = None
        self._thread = None

    def start(self):
        """백그라운드 스레드에서 HTTP 서버 시작"""
        get_calib = self._get_calibration_mode
        get_boxes = self._get_latest_boxes

        # 핸들러 클래스에 참조 주입
        MJPEGHandler.get_calibration_mode = staticmethod(get_calib)
        MJPEGHandler.get_latest_boxes = staticmethod(get_boxes)

        try:
            self._server = HTTPServer(("0.0.0.0", MJPEG_PORT), MJPEGHandler)
            self._thread = threading.Thread(
                target=self._server.serve_forever,
                daemon=True,
                name="mjpeg-server"
            )
            self._thread.start()
            print(f"[MJPEG] 스트리밍 서버 시작 → http://0.0.0.0:{MJPEG_PORT}/stream")
        except OSError as e:
            print(f"[MJPEG] 서버 시작 실패 (포트 {MJPEG_PORT} 사용 중?): {e}")

    def push_frame(self, frame, boxes=None):
        """
        최신 프레임을 버퍼에 업데이트 (메인 루프에서 매 캡처 후 호출)

        Args:
            frame (numpy.ndarray): RGB 이미지
            boxes (list): 감지된 바운딩 박스 목록 (None 이면 빈 리스트)
        """
        if frame is None:
            return
        jpeg = encode_frame(frame, boxes or [], show_overlay=True)
        if jpeg:
            frame_buffer.update(jpeg)

    def stop(self):
        """서버 종료"""
        if self._server:
            self._server.shutdown()
            print("[MJPEG] 서버 종료")
