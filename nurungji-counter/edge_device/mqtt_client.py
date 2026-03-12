"""
누룽지 생산량 카운팅 시스템 - MQTT 클라이언트 모듈
라즈베리 파이에서 PC로 감지 결과 전송
"""

import paho.mqtt.client as mqtt
import json
import time
import base64
import cv2
import numpy as np
from config import (
    MQTT_BROKER_ADDRESS,
    MQTT_BROKER_PORT,
    MQTT_TOPICS,
    DEBUG_MODE
)


class MQTTClient:
    """
    MQTT 통신 클라이언트 클래스
    """

    def __init__(self):
        """MQTT 클라이언트 초기화"""
        self.client = None
        self.connected = False
        self._command_handler = None
        self._initialize_client()

    def _initialize_client(self):
        """MQTT 클라이언트 설정 및 연결"""
        try:
            # 클라이언트 생성
            self.client = mqtt.Client(client_id="nurungji_edge_device")

            # 콜백 설정
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_publish = self._on_publish
            self.client.on_message = self._on_message

            # 브로커 연결
            if DEBUG_MODE:
                print(f"[MQTT] 브로커 연결 시도: {MQTT_BROKER_ADDRESS}:{MQTT_BROKER_PORT}")

            self.client.connect(MQTT_BROKER_ADDRESS, MQTT_BROKER_PORT, keepalive=60)

            # 백그라운드 네트워크 루프 시작
            self.client.loop_start()

        except Exception as e:
            print(f"[MQTT] 오류: 클라이언트 초기화 실패 - {e}")
            self.connected = False

    def _on_connect(self, client, userdata, flags, rc):
        """
        연결 성공 콜백

        Args:
            rc (int): 연결 결과 코드 (0=성공)
        """
        if rc == 0:
            self.connected = True
            # PC로부터 명령 수신을 위해 command 토픽 구독
            client.subscribe(MQTT_TOPICS["command"])
            if DEBUG_MODE:
                print(f"[MQTT] ✓ 브로커 연결 성공")
                print(f"[MQTT] 명령 수신 구독: {MQTT_TOPICS['command']}")
        else:
            self.connected = False
            print(f"[MQTT] ✗ 연결 실패 - 코드: {rc}")

    def _on_disconnect(self, client, userdata, rc):
        """
        연결 해제 콜백
        """
        self.connected = False
        if rc != 0:
            print(f"[MQTT] 예기치 않은 연결 해제 - 코드: {rc}")
            if DEBUG_MODE:
                print(f"[MQTT] 재연결 시도 중...")

    def _on_publish(self, client, userdata, mid):
        """
        메시지 발행 완료 콜백
        """
        if DEBUG_MODE:
            print(f"[MQTT] 메시지 전송 완료 - ID: {mid}")

    def _on_message(self, client, userdata, msg):
        """
        메시지 수신 콜백 (PC로부터 명령 수신)
        """
        try:
            if msg.topic == MQTT_TOPICS["command"]:
                payload = json.loads(msg.payload.decode('utf-8'))
                if DEBUG_MODE:
                    print(f"[MQTT] 명령 수신: {payload}")
                if self._command_handler:
                    self._command_handler(payload)
        except Exception as e:
            print(f"[MQTT] 명령 수신 오류: {e}")

    def set_command_handler(self, callback):
        """
        PC 명령 수신 핸들러 등록

        Args:
            callback (callable): 명령 수신 시 호출할 함수 (payload dict 인자)
        """
        self._command_handler = callback

    def publish_count(self, count, bounding_boxes):
        """
        감지된 누룽지 개수 전송

        Args:
            count (int): 감지된 개수
            bounding_boxes (list): 바운딩 박스 리스트

        Returns:
            bool: 전송 성공 여부
        """
        if not self.connected:
            print("[MQTT] 오류: 브로커에 연결되지 않음")
            return False

        try:
            # 페이로드 생성
            payload = {
                "timestamp": time.time(),
                "count": count,
                "stable_count": count,  # Phase 2에서 안정화 로직 추가 예정
                "boxes": bounding_boxes
            }

            # JSON 직렬화
            message = json.dumps(payload, ensure_ascii=False)

            # 발행
            result = self.client.publish(
                topic=MQTT_TOPICS["count"],
                payload=message,
                qos=1  # 최소 1회 전달 보장
            )

            if DEBUG_MODE:
                print(f"[MQTT] 카운트 전송: {count}개")

            return result.rc == mqtt.MQTT_ERR_SUCCESS

        except Exception as e:
            print(f"[MQTT] 오류: 카운트 전송 실패 - {e}")
            return False

    def publish_batch_complete(self, final_count):
        """
        팬 가득참 신호 전송

        Args:
            final_count (int): 확정된 개수

        Returns:
            bool: 전송 성공 여부
        """
        if not self.connected:
            print("[MQTT] 오류: 브로커에 연결되지 않음")
            return False

        try:
            payload = {
                "timestamp": time.time(),
                "final_count": final_count
            }

            message = json.dumps(payload, ensure_ascii=False)

            result = self.client.publish(
                topic=MQTT_TOPICS["batch_complete"],
                payload=message,
                qos=1
            )

            if DEBUG_MODE:
                print(f"[MQTT] 팬 확정 전송: {final_count}개")

            return result.rc == mqtt.MQTT_ERR_SUCCESS

        except Exception as e:
            print(f"[MQTT] 오류: 팬 확정 전송 실패 - {e}")
            return False

    def publish_status(self, status_data):
        """
        디바이스 상태 전송 (배터리, 온도 등)

        Args:
            status_data (dict): 상태 정보

        Returns:
            bool: 전송 성공 여부
        """
        if not self.connected:
            return False

        try:
            payload = {
                "timestamp": time.time(),
                **status_data
            }

            message = json.dumps(payload, ensure_ascii=False)

            result = self.client.publish(
                topic=MQTT_TOPICS["status"],
                payload=message,
                qos=0  # 상태는 최선 노력 전달
            )

            return result.rc == mqtt.MQTT_ERR_SUCCESS

        except Exception as e:
            print(f"[MQTT] 오류: 상태 전송 실패 - {e}")
            return False

    def publish_calibration_image(self, frame, count, boxes):
        """
        캘리브레이션용 감지 결과 이미지 전송 (PC에서 실시간 확인용)

        Args:
            frame: 카메라 프레임 (numpy array, RGB)
            count (int): 감지된 개수
            boxes (list): 바운딩 박스 리스트

        Returns:
            bool: 전송 성공 여부
        """
        if not self.connected:
            return False

        try:
            # BGR로 변환 후 640x360으로 리사이즈 (전송 크기 최적화)
            vis_frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            vis_frame = cv2.resize(vis_frame, (640, 360))

            # 바운딩 박스 그리기 (리사이즈 비율 적용)
            orig_h, orig_w = frame.shape[:2]
            scale_x = 640 / orig_w
            scale_y = 360 / orig_h
            for box in boxes:
                x = int(box['x'] * scale_x)
                y = int(box['y'] * scale_y)
                w = int(box['w'] * scale_x)
                h = int(box['h'] * scale_y)
                cv2.rectangle(vis_frame, (x, y), (x + w, y + h), (0, 255, 0), 2)

            # 개수 텍스트 오버레이
            cv2.putText(vis_frame, f"Count: {count}", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

            # JPEG 압축 후 base64 인코딩
            _, buffer = cv2.imencode('.jpg', vis_frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
            image_b64 = base64.b64encode(buffer).decode('utf-8')

            payload = {
                "timestamp": time.time(),
                "count": count,
                "image": image_b64
            }

            result = self.client.publish(
                topic=MQTT_TOPICS["calibration_image"],
                payload=json.dumps(payload),
                qos=0
            )

            if DEBUG_MODE:
                print(f"[MQTT] 캘리브레이션 이미지 전송: {count}개, {len(image_b64)} bytes")

            return result.rc == mqtt.MQTT_ERR_SUCCESS

        except Exception as e:
            print(f"[MQTT] 오류: 캘리브레이션 이미지 전송 실패 - {e}")
            return False

    def is_connected(self):
        """
        연결 상태 확인

        Returns:
            bool: 연결 여부
        """
        return self.connected

    def disconnect(self):
        """MQTT 클라이언트 종료"""
        if self.client is not None:
            self.client.loop_stop()
            self.client.disconnect()
            if DEBUG_MODE:
                print("[MQTT] 연결 종료")


# 테스트 코드
if __name__ == "__main__":
    print("MQTT 클라이언트 테스트 시작...")
    print("주의: 실제 MQTT 브로커가 실행 중이어야 합니다.")

    try:
        # 클라이언트 초기화
        mqtt_client = MQTTClient()

        # 연결 대기
        time.sleep(2)

        if mqtt_client.is_connected():
            print("✓ MQTT 브로커 연결 성공")

            # 테스트 데이터 전송
            test_boxes = [
                {"x": 100, "y": 100, "w": 50, "h": 50},
                {"x": 200, "y": 100, "w": 50, "h": 50}
            ]

            # 카운트 전송 테스트
            success = mqtt_client.publish_count(2, test_boxes)
            print(f"카운트 전송: {'성공' if success else '실패'}")

            time.sleep(1)

            # 상태 전송 테스트
            status = {
                "battery_level": 85,
                "temperature": 45.2,
                "uptime": 3600
            }
            success = mqtt_client.publish_status(status)
            print(f"상태 전송: {'성공' if success else '실패'}")

        else:
            print("✗ MQTT 브로커 연결 실패")

    except Exception as e:
        print(f"테스트 실패: {e}")

    finally:
        # 정리
        time.sleep(1)
        mqtt_client.disconnect()
        print("\nMQTT 클라이언트 테스트 완료")
