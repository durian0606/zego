"""
누룽지 생산량 카운팅 시스템 - 엣지 디바이스 설정
라즈베리 파이에서 사용되는 전역 설정
sync test: 2026-02-26
"""

# ============================================
# MQTT 브로커 설정
# ============================================
MQTT_BROKER_ADDRESS = ""  # 공장 설치: MQTT 미사용 (Firebase 모드)
MQTT_BROKER_PORT = 1883
MQTT_TOPICS = {
    "count": "nurungji/count",                # 실시간 카운트
    "batch_complete": "nurungji/batch_complete",  # 팬 확정
    "status": "nurungji/status",              # 디바이스 상태
    "command": "nurungji/command",            # PC → 라즈베리파이 명령
    "calibration_image": "nurungji/calibration/image"  # 캘리브레이션 이미지 → PC
}

# ============================================
# 카메라 설정
# ============================================
CAMERA_RESOLUTION = (1920, 1080)  # 해상도 (너비, 높이)
CAMERA_FRAMERATE = 30
CAPTURE_INTERVAL = 1.0  # 초 단위 - 1초마다 촬영

# ============================================
# 객체 감지 파라미터 (캘리브레이션 필요)
# ============================================
# 이진화 임계값 (0-255, 배경과 누룽지 분리)
BINARY_THRESHOLD = 127

# 누룽지 최소/최대 면적 (픽셀 제곱)
MIN_AREA = 4500      # 이것보다 작으면 노이즈로 간주
MAX_AREA = 90000    # 이것보다 크면 여러 개 겹친 것으로 간주

# 종횡비 필터 (누룽지는 대략 정사각형)
MIN_ASPECT_RATIO = 0.5  # 너비/높이
MAX_ASPECT_RATIO = 2.0

# ============================================
# 안정화 설정
# ============================================
STABILIZATION_WINDOW = 5  # 최근 N개 프레임으로 안정화

# ============================================
# 전력 관리
# ============================================
LOW_BATTERY_THRESHOLD = 20  # 배터리 20% 이하 시 알림
POWER_SAVE_MODE = False     # 전력 절약 모드 (촬영 간격 2배)

# ============================================
# Firebase 설정
# ============================================
FIREBASE_DATABASE_URL = "https://zego-87d69-default-rtdb.asia-southeast1.firebasedatabase.app"

# ============================================
# 디버그 설정
# ============================================
DEBUG_MODE = False          # 디버그 출력 비활성화 (프로덕션)
SAVE_DEBUG_IMAGES = False   # 감지된 이미지 저장 (SD카드 용량 주의)
DEBUG_IMAGE_PATH = "/home/pi/debug_images/"
