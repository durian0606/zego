"""
누룽지 생산량 카운팅 시스템 - 카메라 캡처 모듈
Raspberry Pi Camera Module V2를 사용하여 프레임 캡처
"""

import numpy as np
from picamera2 import Picamera2
from config import CAMERA_RESOLUTION, CAMERA_FRAMERATE, DEBUG_MODE


class CameraCapture:
    """
    라즈베리 파이 카메라 모듈을 관리하는 클래스
    """

    def __init__(self):
        """카메라 초기화"""
        self.camera = None
        self._initialize_camera()

    def _initialize_camera(self):
        """카메라 설정 및 시작"""
        try:
            self.camera = Picamera2()

            # 카메라 설정
            config = self.camera.create_still_configuration(
                main={"size": CAMERA_RESOLUTION, "format": "RGB888"}
            )
            self.camera.configure(config)

            # 카메라 시작
            self.camera.start()

            if DEBUG_MODE:
                print(f"[Camera] 카메라 초기화 완료 - 해상도: {CAMERA_RESOLUTION}")

        except Exception as e:
            print(f"[Camera] 오류: 카메라 초기화 실패 - {e}")
            raise

    def capture_frame(self):
        """
        현재 프레임 캡처

        Returns:
            numpy.ndarray: RGB 이미지 배열 (height, width, 3)
        """
        try:
            # 프레임 캡처
            frame = self.camera.capture_array()

            if DEBUG_MODE:
                print(f"[Camera] 프레임 캡처 완료 - Shape: {frame.shape}")

            return frame

        except Exception as e:
            print(f"[Camera] 오류: 프레임 캡처 실패 - {e}")
            return None

    def capture_and_save(self, filepath):
        """
        프레임 캡처 및 파일로 저장 (디버깅용)

        Args:
            filepath (str): 저장할 파일 경로
        """
        try:
            self.camera.capture_file(filepath)
            print(f"[Camera] 이미지 저장 완료: {filepath}")

        except Exception as e:
            print(f"[Camera] 오류: 이미지 저장 실패 - {e}")

    def get_camera_info(self):
        """
        카메라 정보 반환

        Returns:
            dict: 카메라 정보
        """
        return {
            "resolution": CAMERA_RESOLUTION,
            "framerate": CAMERA_FRAMERATE,
            "is_running": self.camera is not None
        }

    def close(self):
        """카메라 리소스 해제"""
        if self.camera is not None:
            self.camera.stop()
            self.camera.close()
            if DEBUG_MODE:
                print("[Camera] 카메라 종료")


# 테스트 코드
if __name__ == "__main__":
    print("카메라 테스트 시작...")

    # 카메라 초기화
    camera = CameraCapture()

    # 카메라 정보 출력
    info = camera.get_camera_info()
    print(f"카메라 정보: {info}")

    # 프레임 캡처 테스트
    frame = camera.capture_frame()
    if frame is not None:
        print(f"✓ 프레임 캡처 성공 - Shape: {frame.shape}, Type: {frame.dtype}")
    else:
        print("✗ 프레임 캡처 실패")

    # 테스트 이미지 저장
    camera.capture_and_save("/tmp/test_capture.jpg")

    # 카메라 종료
    camera.close()
    print("카메라 테스트 완료")
