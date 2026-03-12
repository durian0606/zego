"""
MJPEG 스트림 릴레이 서버 (나스에서 실행)

라즈베리파이의 MJPEG 스트림을 중계하여 다른 WiFi에서도 카메라 화면을 볼 수 있게 합니다.

사용법:
    python3 tools/stream_relay.py --rpi-ip 192.168.0.XXX
    python3 tools/stream_relay.py --rpi-ip 192.168.0.XXX --port 8888

접속:
    브라우저: http://나스IP:8888/
    직접 스트림: http://나스IP:8888/stream
"""

import argparse
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.error import URLError
from urllib.request import urlopen

# 기본값
DEFAULT_PORT = 8888
DEFAULT_RPI_PORT = 8080

# 전역 설정 (argparse 후 채워짐)
rpi_base_url = ""


HTML_VIEWER = """\
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>누룽지 카운터 - 카메라 뷰어</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: #1a1a2e;
      color: #eee;
      font-family: 'Segoe UI', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
    }}
    h1 {{
      font-size: 1.4rem;
      margin-bottom: 16px;
      color: #a8d8a8;
      letter-spacing: 1px;
    }}
    .stream-container {{
      border: 2px solid #2d5a27;
      border-radius: 8px;
      overflow: hidden;
      background: #000;
      max-width: 100%;
    }}
    img.stream {{
      display: block;
      max-width: 100%;
      height: auto;
    }}
    .info {{
      margin-top: 12px;
      font-size: 0.8rem;
      color: #888;
    }}
    .status {{
      margin-top: 6px;
      font-size: 0.75rem;
      color: #666;
    }}
  </style>
</head>
<body>
  <h1>누룽지 생산량 카운터 - 카메라 뷰어</h1>
  <div class="stream-container">
    <img class="stream" src="/stream" alt="카메라 스트림"
         onerror="this.alt='연결 끊김 - 라즈베리파이를 확인하세요'">
  </div>
  <p class="info">라즈베리파이 MJPEG 스트림 중계 중</p>
  <p class="status">스트림 소스: {rpi_url}</p>
</body>
</html>
"""


class RelayHandler(BaseHTTPRequestHandler):
    """MJPEG 릴레이 HTTP 핸들러"""

    def log_message(self, format, *args):
        # 기본 로그 포맷 유지 (요청마다 출력)
        print(f"[{self.address_string()}] {format % args}")

    def do_GET(self):
        if self.path == "/":
            self._serve_viewer()
        elif self.path == "/stream":
            self._relay_stream()
        elif self.path == "/snapshot":
            self._relay_snapshot()
        else:
            self.send_error(404)

    def _serve_viewer(self):
        """브라우저용 HTML 뷰어 페이지 반환"""
        html = HTML_VIEWER.format(rpi_url=rpi_base_url).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.end_headers()
        self.wfile.write(html)

    def _relay_stream(self):
        """RPi MJPEG 스트림을 그대로 중계"""
        url = f"{rpi_base_url}/stream"
        try:
            resp = urlopen(url, timeout=10)
        except URLError as e:
            print(f"[릴레이] RPi 연결 실패: {e}")
            self.send_error(502, f"라즈베리파이 연결 실패: {e}")
            return

        # RPi에서 받은 Content-Type 헤더 그대로 전달 (multipart/x-mixed-replace)
        content_type = resp.headers.get("Content-Type", "multipart/x-mixed-replace; boundary=mjpeg-boundary")

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        try:
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            # 클라이언트가 연결을 끊은 경우 (정상)
            pass
        except OSError:
            pass
        finally:
            resp.close()

    def _relay_snapshot(self):
        """RPi 스냅샷을 프록시"""
        url = f"{rpi_base_url}/snapshot"
        try:
            resp = urlopen(url, timeout=5)
            data = resp.read()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(data)
        except URLError as e:
            print(f"[릴레이] 스냅샷 오류: {e}")
            self.send_error(502, f"라즈베리파이 연결 실패: {e}")


def main():
    global rpi_base_url

    parser = argparse.ArgumentParser(
        description="라즈베리파이 MJPEG 스트림 릴레이 서버 (나스에서 실행)"
    )
    parser.add_argument(
        "--rpi-ip",
        required=True,
        help="라즈베리파이 IP 주소 (예: 192.168.0.100)",
    )
    parser.add_argument(
        "--rpi-port",
        type=int,
        default=DEFAULT_RPI_PORT,
        help=f"라즈베리파이 MJPEG 포트 (기본값: {DEFAULT_RPI_PORT})",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"나스에서 열 포트 (기본값: {DEFAULT_PORT})",
    )

    args = parser.parse_args()
    rpi_base_url = f"http://{args.rpi_ip}:{args.rpi_port}"

    server = HTTPServer(("0.0.0.0", args.port), RelayHandler)

    print("=" * 55)
    print("  누룽지 카운터 - MJPEG 스트림 릴레이")
    print("=" * 55)
    print(f"  RPi 스트림 소스: {rpi_base_url}/stream")
    print(f"  릴레이 포트:     {args.port}")
    print()
    print(f"  브라우저 접속:  http://나스IP:{args.port}/")
    print(f"  직접 스트림:    http://나스IP:{args.port}/stream")
    print()
    print("  종료: Ctrl+C")
    print("=" * 55)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[릴레이] 서버 종료")
        server.server_close()
        sys.exit(0)


if __name__ == "__main__":
    main()
