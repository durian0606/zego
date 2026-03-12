"""
Firebase REST API 클라이언트 (urllib 내장 라이브러리 사용)
라즈베리 파이에서 추가 설치 없이 Firebase Realtime Database에 접근
"""

import urllib.request
import urllib.error
import json
import socket
from config import FIREBASE_DATABASE_URL, DEBUG_MODE


def _firebase_get(path):
    """Firebase에서 데이터 읽기"""
    url = f"{FIREBASE_DATABASE_URL}/{path}.json"
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            data = json.loads(response.read().decode())
            return data
    except urllib.error.URLError as e:
        if DEBUG_MODE:
            print(f"[Firebase] GET 오류 ({path}): {e}")
        return None
    except Exception as e:
        if DEBUG_MODE:
            print(f"[Firebase] GET 예외 ({path}): {e}")
        return None


def _firebase_patch(path, data):
    """Firebase에 데이터 부분 업데이트 (PATCH)"""
    url = f"{FIREBASE_DATABASE_URL}/{path}.json"
    payload = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=payload,
        method='PATCH',
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return json.loads(response.read().decode())
    except urllib.error.URLError as e:
        if DEBUG_MODE:
            print(f"[Firebase] PATCH 오류 ({path}): {e}")
        return None
    except Exception as e:
        if DEBUG_MODE:
            print(f"[Firebase] PATCH 예외 ({path}): {e}")
        return None


def get_device_power():
    """
    Firebase devicePower 상태 조회

    Returns:
        str | None: "on" | "off", 없으면 None
    """
    data = _firebase_get("devicePower")
    return data if isinstance(data, str) else None


def get_active_product():
    """
    Firebase에서 현재 생산 중인 제품명 조회

    Returns:
        str | None: 제품명 (예: "누룽지"), 없으면 None
    """
    data = _firebase_get("activeProduction/product")
    if isinstance(data, str) and data.strip():
        return data.strip()
    return None


def increment_production(product_name, count):
    """
    Firebase products/{product_name}/todayProduction 에 count 누적

    Args:
        product_name (str): 제품명 (Firebase key)
        count (int): 추가할 수량

    Returns:
        bool: 성공 여부
    """
    if not product_name or count <= 0:
        return False

    # 현재값 읽기
    current = _firebase_get(f"products/{product_name}/todayProduction")
    current_val = int(current) if isinstance(current, (int, float)) else 0
    new_val = current_val + count

    result = _firebase_patch(
        f"products/{product_name}",
        {"todayProduction": new_val, "updatedAt": _now_ms()}
    )

    if result is not None:
        if DEBUG_MODE:
            print(f"[Firebase] {product_name} 금일생산 {current_val} → {new_val} (+{count})")
        return True
    return False


def push_pan_confirm(count):
    """
    Firebase edgeDevice/panConfirm 에 팬 완료 알림 기록
    zego 웹앱이 감지하여 사용자에게 알림을 표시함

    Args:
        count (int): 이번 팬에서 감지된 누룽지 개수
    """
    _firebase_patch("edgeDevice/panConfirm", {
        "count": count,
        "timestamp": _now_ms(),
        "confirmed": False
    })
    if DEBUG_MODE:
        print(f"[Firebase] 팬 완료 알림 기록: {count}개")


def push_current_count(count):
    """
    Firebase edgeDevice/currentCount 를 빠르게 업데이트 (3초마다 호출)
    CPU 온도 조회 없이 count + lastSeen 만 가볍게 PATCH

    Args:
        count (int): 현재 감지 중인 갯수
    """
    _firebase_patch("edgeDevice", {"currentCount": count, "lastSeen": _now_ms()})


def push_device_status(count, cpu_temp, frames_total):
    """
    Firebase edgeDevice/ 에 장치 상태 업데이트 (30초마다 호출)

    Args:
        count (int): 현재 감지 중인 갯수
        cpu_temp (float | None): CPU 온도 (°C)
        frames_total (int): 누적 처리 프레임 수
    """
    data = {
        "status": "running",
        "lastSeen": _now_ms(),
        "currentCount": count,
        "framesTotal": frames_total,
    }
    if cpu_temp is not None:
        data["cpuTemp"] = cpu_temp

    ip = _get_local_ip()
    if ip:
        data["ipAddress"] = ip

    result = _firebase_patch("edgeDevice", data)
    if DEBUG_MODE:
        if result is not None:
            print(f"[Firebase] 장치 상태 업데이트: count={count}, temp={cpu_temp}")
        else:
            print("[Firebase] 장치 상태 업데이트 실패")
    return result is not None


def set_device_stopped():
    """Firebase edgeDevice/ 상태를 stopped로 업데이트"""
    result = _firebase_patch("edgeDevice", {
        "status": "stopped",
        "lastSeen": _now_ms()
    })
    if DEBUG_MODE:
        print("[Firebase] 장치 상태: stopped")
    return result is not None


def get_device_settings():
    """
    Firebase deviceSettings/ 에서 감지 파라미터 설정 읽기

    Returns:
        dict | None: 설정 딕셔너리, 없으면 None
    """
    data = _firebase_get("deviceSettings")
    if isinstance(data, dict):
        if DEBUG_MODE:
            print(f"[Firebase] 장치 설정 로드: {data}")
        return data
    return None


def poll_command(callback):
    """
    Firebase deviceCommands 노드에서 미처리 명령을 폴링하여 실행.
    메인 루프에서 주기적으로 호출하면 됨 (실시간 리스너 대신 REST 폴링).

    명령 구조:
        {
            "action": "calibration_start" | "calibration_stop",
            "timestamp": <ms>,
            "processed": false
        }

    Args:
        callback (callable): callback(action: str) 형태로 호출됨

    Returns:
        bool: 처리된 명령이 있으면 True
    """
    data = _firebase_get("deviceCommands")
    if not isinstance(data, dict):
        return False

    # 이미 처리된 명령은 무시
    if data.get("processed", True):
        return False

    action = data.get("action", "")
    if not action:
        return False

    # 즉시 processed 플래그 설정 (중복 실행 방지)
    _firebase_patch("deviceCommands", {"processed": True})

    try:
        callback({"action": action})
    except Exception as e:
        if DEBUG_MODE:
            print(f"[Firebase] 명령 처리 오류 ({action}): {e}")

    if DEBUG_MODE:
        print(f"[Firebase] 명령 처리 완료: action={action}")

    return True


def _get_local_ip():
    """로컬 IP 주소 조회 (웹앱 카메라 스트리밍 URL 제공용)"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None


def _now_ms():
    """현재 Unix 타임스탬프 (밀리초)"""
    import time
    return int(time.time() * 1000)
