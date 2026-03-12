"""
누룽지 생산량 카운팅 시스템 - 객체 감지 모듈
OpenCV 윤곽선 감지를 사용하여 누룽지 개수 카운팅
"""

import cv2
import numpy as np
from config import (
    BINARY_THRESHOLD,
    MIN_AREA,
    MAX_AREA,
    MIN_ASPECT_RATIO,
    MAX_ASPECT_RATIO,
    DEBUG_MODE,
    SAVE_DEBUG_IMAGES,
    DEBUG_IMAGE_PATH
)
import os
from datetime import datetime


class NurungjiDetector:
    """
    누룽지 객체 감지 및 카운팅 클래스
    """

    def __init__(self):
        """감지기 초기화"""
        self.frame_count = 0
        if SAVE_DEBUG_IMAGES and not os.path.exists(DEBUG_IMAGE_PATH):
            os.makedirs(DEBUG_IMAGE_PATH)

    def detect(self, frame):
        """
        프레임에서 누룽지 개수 감지

        Args:
            frame (numpy.ndarray): RGB 이미지 배열

        Returns:
            tuple: (개수, 바운딩 박스 리스트)
                   바운딩 박스: [{"x": int, "y": int, "w": int, "h": int}, ...]
        """
        if frame is None:
            return 0, []

        self.frame_count += 1

        # 1. 전처리
        gray = self._convert_to_grayscale(frame)
        blurred = self._apply_blur(gray)

        # 2. 이진화
        binary = self._apply_threshold(blurred)

        # 3. 윤곽선 찾기
        contours = self._find_contours(binary)

        # 4. 필터링 및 카운팅
        valid_objects = self._filter_objects(contours)

        # 5. 디버그 이미지 저장 (옵션)
        if SAVE_DEBUG_IMAGES:
            self._save_debug_image(frame, valid_objects)

        count = len(valid_objects)

        if DEBUG_MODE:
            print(f"[Detector] 프레임 #{self.frame_count} - 감지된 누룽지: {count}개")

        return count, valid_objects

    def _convert_to_grayscale(self, frame):
        """
        컬러 이미지를 그레이스케일로 변환

        Args:
            frame (numpy.ndarray): RGB 이미지

        Returns:
            numpy.ndarray: 그레이스케일 이미지
        """
        # picamera2는 RGB 형식 반환, OpenCV는 BGR 기대
        # 하지만 그레이스케일 변환에는 영향 없음
        if len(frame.shape) == 3:
            gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
        else:
            gray = frame
        return gray

    def _apply_blur(self, image):
        """
        가우시안 블러 적용 (노이즈 제거)

        Args:
            image (numpy.ndarray): 입력 이미지

        Returns:
            numpy.ndarray: 블러 처리된 이미지
        """
        return cv2.GaussianBlur(image, (5, 5), 0)

    def _apply_threshold(self, image):
        """
        이진화 적용 (배경과 객체 분리)

        Args:
            image (numpy.ndarray): 그레이스케일 이미지

        Returns:
            numpy.ndarray: 이진 이미지
        """
        # 고정 임계값 사용
        _, binary = cv2.threshold(image, BINARY_THRESHOLD, 255, cv2.THRESH_BINARY)

        # 또는 적응형 임계값 사용 (조명 변화에 강함)
        # binary = cv2.adaptiveThreshold(
        #     image, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        #     cv2.THRESH_BINARY, 11, 2
        # )

        return binary

    def _find_contours(self, binary_image):
        """
        윤곽선 찾기

        Args:
            binary_image (numpy.ndarray): 이진 이미지

        Returns:
            list: 윤곽선 리스트
        """
        contours, _ = cv2.findContours(
            binary_image,
            cv2.RETR_EXTERNAL,  # 외부 윤곽선만
            cv2.CHAIN_APPROX_SIMPLE  # 압축
        )
        return contours

    def _filter_objects(self, contours):
        """
        윤곽선 필터링 (크기, 종횡비 기준)

        Args:
            contours (list): 윤곽선 리스트

        Returns:
            list: 유효한 객체의 바운딩 박스 리스트
        """
        valid_objects = []

        for contour in contours:
            # 면적 계산
            area = cv2.contourArea(contour)

            # 면적 필터
            if area < MIN_AREA or area > MAX_AREA:
                continue

            # 바운딩 박스 계산
            x, y, w, h = cv2.boundingRect(contour)

            # 종횡비 계산 (가로/세로)
            aspect_ratio = w / h if h > 0 else 0

            # 종횡비 필터
            if aspect_ratio < MIN_ASPECT_RATIO or aspect_ratio > MAX_ASPECT_RATIO:
                continue

            # 유효한 객체
            valid_objects.append({
                "x": int(x),
                "y": int(y),
                "w": int(w),
                "h": int(h),
                "area": int(area),
                "aspect_ratio": round(aspect_ratio, 2)
            })

        return valid_objects

    def _save_debug_image(self, frame, valid_objects):
        """
        감지 결과를 시각화하여 저장 (디버깅용)

        Args:
            frame (numpy.ndarray): 원본 이미지
            valid_objects (list): 감지된 객체 리스트
        """
        # BGR로 변환 (OpenCV 저장용)
        debug_image = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

        # 바운딩 박스 그리기
        for obj in valid_objects:
            x, y, w, h = obj["x"], obj["y"], obj["w"], obj["h"]
            cv2.rectangle(debug_image, (x, y), (x + w, y + h), (0, 255, 0), 2)

            # 정보 텍스트
            text = f"Area: {obj['area']}"
            cv2.putText(debug_image, text, (x, y - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

        # 총 개수 표시
        count_text = f"Count: {len(valid_objects)}"
        cv2.putText(debug_image, count_text, (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

        # 파일 저장
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"frame_{self.frame_count:04d}_{timestamp}.jpg"
        filepath = os.path.join(DEBUG_IMAGE_PATH, filename)
        cv2.imwrite(filepath, debug_image)

    def get_detection_stats(self):
        """
        감지 통계 반환

        Returns:
            dict: 통계 정보
        """
        return {
            "total_frames": self.frame_count,
            "threshold": BINARY_THRESHOLD,
            "min_area": MIN_AREA,
            "max_area": MAX_AREA
        }


# 테스트 코드
if __name__ == "__main__":
    print("객체 감지 테스트 시작...")

    # 테스트 이미지 생성 (가상 누룽지)
    test_image = np.zeros((480, 640, 3), dtype=np.uint8)

    # 흰색 배경
    test_image[:, :] = (200, 200, 200)

    # 가상 누룽지 그리기 (어두운 사각형)
    test_image[100:180, 100:180] = (50, 50, 50)  # 누룽지 1
    test_image[100:180, 250:330] = (50, 50, 50)  # 누룽지 2
    test_image[250:330, 100:180] = (50, 50, 50)  # 누룽지 3

    # 감지기 초기화
    detector = NurungjiDetector()

    # 감지 수행
    count, objects = detector.detect(test_image)

    print(f"\n✓ 감지 결과: {count}개")
    for i, obj in enumerate(objects, 1):
        print(f"  누룽지 #{i}: 위치=({obj['x']}, {obj['y']}), "
              f"크기=({obj['w']}x{obj['h']}), 면적={obj['area']}")

    # 통계 출력
    stats = detector.get_detection_stats()
    print(f"\n통계: {stats}")

    print("\n객체 감지 테스트 완료")
