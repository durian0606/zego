"""
Excel Monitor - 전역 설정

애플리케이션의 전역 설정 및 상수 정의
"""

import os
from datetime import datetime
from pathlib import Path


# ===== 경로 설정 =====
def get_default_log_directory():
    """기본 로그 디렉토리 경로 반환"""
    # Windows: C:\Users\{username}\Documents\ExcelMonitor\logs
    # Linux/Mac: ~/Documents/ExcelMonitor/logs (테스트용)
    if os.name == 'nt':  # Windows
        documents = os.path.join(os.path.expanduser('~'), 'Documents')
    else:  # Linux/Mac
        documents = os.path.join(os.path.expanduser('~'), 'Documents')

    log_dir = os.path.join(documents, 'ExcelMonitor', 'logs')
    return log_dir


def get_log_file_path(log_directory=None):
    """날짜별 로그 파일 경로 생성

    Args:
        log_directory: 로그 디렉토리 경로 (None이면 기본 경로 사용)

    Returns:
        str: 로그 파일 전체 경로 (예: .../logs/excel_monitor_2025-02-20.log)
    """
    if log_directory is None:
        log_directory = get_default_log_directory()

    # 디렉토리가 없으면 생성
    os.makedirs(log_directory, exist_ok=True)

    # 날짜별 파일명 생성
    today = datetime.now().strftime('%Y-%m-%d')
    log_filename = f'excel_monitor_{today}.log'

    return os.path.join(log_directory, log_filename)


# ===== 이벤트 타입 정의 =====
class EventType:
    """Excel 모니터링 이벤트 타입"""
    # 파일 이벤트
    FILE_OPEN = "FILE_OPEN"
    FILE_CLOSE = "FILE_CLOSE"
    FILE_SAVE_BEFORE = "FILE_SAVE_BEFORE"
    FILE_SAVE = "FILE_SAVE"
    FILE_ACTIVATE = "FILE_ACTIVATE"              # Phase 2: 워크북 활성화

    # 셀 이벤트
    CELL_CHANGE = "CELL_CHANGE"
    PASTE = "PASTE"
    FORMULA_CHANGE = "FORMULA_CHANGE"

    # 시트 이벤트
    SHEET_ADD = "SHEET_ADD"
    SHEET_DELETE = "SHEET_DELETE"                # Phase 2: 시트 삭제
    SHEET_CHANGE = "SHEET_CHANGE"
    SHEET_ACTIVATE = "SHEET_ACTIVATE"            # Phase 2: 시트 활성화
    SHEET_RENAME = "SHEET_RENAME"                # Phase 2: 시트 이름 변경

    # 행/열 이벤트 (Phase 2)
    ROW_INSERT = "ROW_INSERT"                    # 행 삽입
    ROW_DELETE = "ROW_DELETE"                    # 행 삭제
    COLUMN_INSERT = "COLUMN_INSERT"              # 열 삽입
    COLUMN_DELETE = "COLUMN_DELETE"              # 열 삭제

    # 기타 이벤트
    PRINT = "PRINT"
    CALCULATE = "CALCULATE"                      # Phase 2: 계산/재계산

    # 시스템 이벤트
    ERROR = "ERROR"
    INFO = "INFO"
    WARNING = "WARNING"                          # Phase 2: 경고


# ===== GUI 설정 =====
class Colors:
    """GUI 색상 테마 (jumoon 패턴)"""
    # Primary colors
    PRIMARY = "#27ae60"      # 초록 (시작 버튼)
    DANGER = "#e74c3c"       # 빨강 (정지 버튼)
    SECONDARY = "#3498db"    # 파랑 (로그 열기)
    WARNING = "#f39c12"      # 주황 (경고)

    # Background colors
    BG_DARK = "#2c3e50"      # 어두운 배경 (로그 창)
    BG_LIGHT = "#ecf0f1"     # 밝은 배경

    # Text colors
    TEXT_LIGHT = "#ffffff"   # 흰색 텍스트
    TEXT_DARK = "#2c3e50"    # 어두운 텍스트

    # Status colors
    STATUS_ACTIVE = "#27ae60"    # 모니터링 중
    STATUS_INACTIVE = "#95a5a6"  # 대기 중
    STATUS_ERROR = "#e74c3c"     # 에러


class Fonts:
    """GUI 폰트 설정"""
    HEADER = ("맑은 고딕", 14, "bold")
    NORMAL = ("맑은 고딕", 10)
    BUTTON = ("맑은 고딕", 10, "bold")
    LOG = ("Consolas", 9)  # 고정폭 폰트
    STATUS = ("맑은 고딕", 9)


# ===== 로그 설정 =====
class LogSettings:
    """로그 관련 설정"""
    MAX_LOG_SIZE_MB = 100  # 로그 파일 최대 크기 (MB)
    MAX_LOG_FILES = 30     # 보관할 로그 파일 개수 (30일치)
    ROTATION_ENABLED = True  # 로그 로테이션 활성화

    # 로그 포맷
    TIMESTAMP_FORMAT = "%Y-%m-%d %H:%M:%S"
    LOG_FORMAT = "[{timestamp}] {event_type}: {message}"


# ===== 모니터링 설정 =====
class MonitorSettings:
    """모니터링 관련 설정"""
    # 기본적으로 활성화할 이벤트
    DEFAULT_ENABLED_EVENTS = {
        # 파일 이벤트
        EventType.FILE_OPEN: True,
        EventType.FILE_CLOSE: True,
        EventType.FILE_SAVE_BEFORE: False,  # 너무 빈번할 수 있음
        EventType.FILE_SAVE: True,
        EventType.FILE_ACTIVATE: False,     # Phase 2: 빈번함, 기본 비활성화

        # 셀 이벤트
        EventType.CELL_CHANGE: True,
        EventType.PASTE: True,
        EventType.FORMULA_CHANGE: True,

        # 시트 이벤트
        EventType.SHEET_ADD: True,
        EventType.SHEET_DELETE: True,       # Phase 2
        EventType.SHEET_CHANGE: False,      # 너무 빈번할 수 있음
        EventType.SHEET_ACTIVATE: False,    # Phase 2: 빈번함
        EventType.SHEET_RENAME: True,       # Phase 2

        # 행/열 이벤트 (Phase 2)
        EventType.ROW_INSERT: True,
        EventType.ROW_DELETE: True,
        EventType.COLUMN_INSERT: True,
        EventType.COLUMN_DELETE: True,

        # 기타
        EventType.PRINT: True,
        EventType.CALCULATE: False,         # Phase 2: 매우 빈번함
    }

    # GUI 업데이트 간격 (초)
    STATS_UPDATE_INTERVAL = 5

    # Excel COM 연결 재시도 설정
    COM_RETRY_COUNT = 3
    COM_RETRY_DELAY = 1.0  # 초


# ===== 애플리케이션 정보 =====
class AppInfo:
    """애플리케이션 정보"""
    NAME = "Excel 모니터링 시스템"
    VERSION = "1.0.0"
    DESCRIPTION = "PC에서 실행되는 모든 Excel 파일의 작업 상세 모니터링"
    AUTHOR = "Excel Monitor Development Team"

    # 윈도우 크기
    WINDOW_WIDTH = 800
    WINDOW_HEIGHT = 600
    WINDOW_MIN_WIDTH = 600
    WINDOW_MIN_HEIGHT = 400


# ===== 설정 파일 =====
SETTINGS_FILE = "settings.json"


if __name__ == "__main__":
    # 설정 테스트
    print(f"기본 로그 디렉토리: {get_default_log_directory()}")
    print(f"오늘의 로그 파일: {get_log_file_path()}")
    print(f"\n이벤트 타입:")
    for attr in dir(EventType):
        if not attr.startswith('_'):
            print(f"  - {getattr(EventType, attr)}")
