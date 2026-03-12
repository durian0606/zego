"""
누룽지 생산량 카운팅 시스템 - 카메라 테스트 도구
라즈베리 파이 설치 후 카메라 동작 확인 및 캘리브레이션용
"""

import time
import os
from camera_capture import CameraCapture
from detector import NurungjiDetector
import cv2
import numpy as np


def test_camera_basic():
    """
    기본 카메라 테스트
    """
    print("\n" + "=" * 50)
    print("테스트 1: 카메라 기본 동작 확인")
    print("=" * 50)

    try:
        camera = CameraCapture()

        # 카메라 정보
        info = camera.get_camera_info()
        print(f"\n카메라 정보:")
        print(f"  - 해상도: {info['resolution']}")
        print(f"  - 프레임레이트: {info['framerate']}")
        print(f"  - 실행 상태: {info['is_running']}")

        # 프레임 캡처 테스트
        print("\n프레임 캡처 중...")
        frame = camera.capture_frame()

        if frame is not None:
            print(f"✓ 캡처 성공")
            print(f"  - Shape: {frame.shape}")
            print(f"  - Type: {frame.dtype}")
            print(f"  - Min/Max 값: {frame.min()} / {frame.max()}")

            # 테스트 이미지 저장
            output_dir = "/tmp/nurungji_test"
            os.makedirs(output_dir, exist_ok=True)

            output_path = os.path.join(output_dir, "camera_test.jpg")
            camera.capture_and_save(output_path)
            print(f"✓ 테스트 이미지 저장: {output_path}")

            return True
        else:
            print("✗ 캡처 실패")
            return False

    except Exception as e:
        print(f"✗ 테스트 실패: {e}")
        import traceback
        traceback.print_exc()
        return False

    finally:
        camera.close()


def test_detection():
    """
    객체 감지 테스트
    """
    print("\n" + "=" * 50)
    print("테스트 2: 객체 감지 테스트")
    print("=" * 50)

    try:
        camera = CameraCapture()
        detector = NurungjiDetector()

        print("\n10개 프레임 캡처 및 감지 중...")

        results = []
        for i in range(10):
            print(f"  프레임 {i + 1}/10...", end=" ")

            # 프레임 캡처
            frame = camera.capture_frame()

            # 객체 감지
            count, boxes = detector.detect(frame)
            results.append(count)

            print(f"감지: {count}개")

            time.sleep(0.5)

        # 통계
        print(f"\n감지 결과 통계:")
        print(f"  - 평균: {np.mean(results):.1f}개")
        print(f"  - 최소: {min(results)}개")
        print(f"  - 최대: {max(results)}개")
        print(f"  - 표준편차: {np.std(results):.1f}")

        # 안정성 평가
        if np.std(results) < 1.0:
            print(f"✓ 감지 안정성: 우수")
        elif np.std(results) < 2.0:
            print(f"⚠️  감지 안정성: 보통 - 캘리브레이션 권장")
        else:
            print(f"✗ 감지 안정성: 불량 - 캘리브레이션 필수")

        return True

    except Exception as e:
        print(f"✗ 테스트 실패: {e}")
        import traceback
        traceback.print_exc()
        return False

    finally:
        camera.close()


def test_calibration_helper():
    """
    캘리브레이션 도우미 - 실시간 감지 결과 표시
    """
    print("\n" + "=" * 50)
    print("테스트 3: 캘리브레이션 도우미")
    print("=" * 50)
    print("\n실시간으로 감지 결과를 표시합니다.")
    print("누룽지를 1개씩 추가하면서 정확도를 확인하세요.")
    print("종료하려면 Ctrl+C를 누르세요.\n")

    try:
        camera = CameraCapture()
        detector = NurungjiDetector()

        # 출력 디렉토리
        output_dir = "/tmp/nurungji_calibration"
        os.makedirs(output_dir, exist_ok=True)

        frame_count = 0

        while True:
            frame_count += 1

            # 프레임 캡처
            frame = camera.capture_frame()

            # 객체 감지
            count, boxes = detector.detect(frame)

            # 결과 출력
            print(f"[프레임 #{frame_count:04d}] 감지: {count}개", end="")

            if boxes:
                print(f" - 상세:")
                for i, box in enumerate(boxes, 1):
                    print(f"    #{i}: 위치=({box['x']}, {box['y']}), "
                          f"크기={box['w']}x{box['h']}, "
                          f"면적={box['area']}")
            else:
                print()

            # 시각화 이미지 저장 (5초마다)
            if frame_count % 5 == 0:
                # BGR로 변환
                vis_frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

                # 바운딩 박스 그리기
                for box in boxes:
                    x, y, w, h = box['x'], box['y'], box['w'], box['h']
                    cv2.rectangle(vis_frame, (x, y), (x + w, y + h), (0, 255, 0), 2)

                # 개수 표시
                text = f"Count: {count}"
                cv2.putText(vis_frame, text, (10, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

                # 저장
                output_path = os.path.join(output_dir, f"frame_{frame_count:04d}.jpg")
                cv2.imwrite(output_path, vis_frame)
                print(f"    → 이미지 저장: {output_path}")

            time.sleep(1)

    except KeyboardInterrupt:
        print("\n\n사용자가 중단함")

    except Exception as e:
        print(f"\n✗ 오류: {e}")
        import traceback
        traceback.print_exc()

    finally:
        camera.close()
        print(f"\n캘리브레이션 이미지 저장 위치: {output_dir}")


def print_menu():
    """
    메뉴 출력
    """
    print("\n" + "=" * 50)
    print("누룽지 카운팅 시스템 - 카메라 테스트 도구")
    print("=" * 50)
    print("\n테스트 선택:")
    print("  1. 카메라 기본 동작 확인")
    print("  2. 객체 감지 테스트 (10개 프레임)")
    print("  3. 캘리브레이션 도우미 (실시간 감지)")
    print("  0. 종료")
    print()


def main():
    """
    메인 함수
    """
    while True:
        print_menu()
        choice = input("선택: ").strip()

        if choice == "1":
            test_camera_basic()

        elif choice == "2":
            test_detection()

        elif choice == "3":
            test_calibration_helper()

        elif choice == "0":
            print("\n종료합니다.")
            break

        else:
            print("잘못된 선택입니다.")

        input("\n계속하려면 Enter를 누르세요...")


if __name__ == "__main__":
    main()
