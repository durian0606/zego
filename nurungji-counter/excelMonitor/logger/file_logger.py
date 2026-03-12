"""
Excel Monitor - 파일 로거

Excel 이벤트를 텍스트 파일에 기록하고 관리
"""

import os
import shutil
from datetime import datetime
from typing import Dict, Optional
from threading import Lock

from ..config import (
    get_log_file_path,
    LogSettings,
    EventType
)


class FileLogger:
    """텍스트 파일 로거 클래스"""

    def __init__(self, log_directory: str = None):
        """
        Args:
            log_directory: 로그 디렉토리 경로 (None이면 기본 경로 사용)
        """
        self.log_directory = log_directory
        self.log_file_path = get_log_file_path(log_directory)

        # 통계
        self.event_count = 0
        self.tracked_files = set()  # 추적 중인 파일 경로
        self.start_time = None

        # 스레드 안전성을 위한 Lock
        self.lock = Lock()

        # 로그 디렉토리 생성
        os.makedirs(os.path.dirname(self.log_file_path), exist_ok=True)

        print(f"로그 파일 경로: {self.log_file_path}")

    def log_event(self, event_type: str, message: str) -> None:
        """이벤트 로그 기록

        Args:
            event_type: 이벤트 타입 (EventType 상수)
            message: 로그 메시지
        """
        with self.lock:
            try:
                # 타임스탬프 생성
                timestamp = datetime.now().strftime(LogSettings.TIMESTAMP_FORMAT)

                # 로그 메시지 포맷팅
                log_message = LogSettings.LOG_FORMAT.format(
                    timestamp=timestamp,
                    event_type=event_type,
                    message=message
                )

                # 파일에 쓰기 (append 모드)
                with open(self.log_file_path, 'a', encoding='utf-8') as f:
                    f.write(log_message + '\n')

                # 통계 업데이트
                self.event_count += 1

                # 콘솔에도 출력
                print(log_message)

                # 로그 로테이션 체크
                if LogSettings.ROTATION_ENABLED:
                    self.rotate_log_if_needed()

            except Exception as e:
                print(f"로그 기록 실패: {e}")

    def track_file(self, file_path: str) -> None:
        """파일 추적 시작

        Args:
            file_path: 추적할 파일 경로
        """
        with self.lock:
            self.tracked_files.add(file_path)

    def untrack_file(self, file_path: str) -> None:
        """파일 추적 중지

        Args:
            file_path: 추적 중지할 파일 경로
        """
        with self.lock:
            self.tracked_files.discard(file_path)

    def get_stats(self) -> Dict[str, any]:
        """통계 정보 반환

        Returns:
            Dict: 통계 정보 딕셔너리
                - event_count: 총 이벤트 수
                - tracked_files_count: 추적 중인 파일 수
                - uptime: 가동 시간 (초)
                - uptime_str: 가동 시간 (문자열)
        """
        with self.lock:
            uptime = 0
            uptime_str = "00:00:00"

            if self.start_time:
                uptime = int((datetime.now() - self.start_time).total_seconds())
                hours = uptime // 3600
                minutes = (uptime % 3600) // 60
                seconds = uptime % 60
                uptime_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"

            return {
                "event_count": self.event_count,
                "tracked_files_count": len(self.tracked_files),
                "tracked_files": list(self.tracked_files),
                "uptime": uptime,
                "uptime_str": uptime_str,
                "log_file": self.log_file_path
            }

    def start_monitoring(self) -> None:
        """모니터링 시작 - 시작 시간 기록"""
        with self.lock:
            self.start_time = datetime.now()
            self.event_count = 0
            self.tracked_files.clear()

        self.log_event(EventType.INFO, "모니터링 시작")

    def stop_monitoring(self) -> None:
        """모니터링 중지"""
        stats = self.get_stats()
        self.log_event(
            EventType.INFO,
            f"모니터링 중지 - 총 {stats['event_count']}개 이벤트, "
            f"가동 시간: {stats['uptime_str']}"
        )

        with self.lock:
            self.start_time = None

    def rotate_log_if_needed(self) -> None:
        """로그 파일 크기를 체크하고 필요시 로테이션"""
        try:
            # 파일 크기 확인
            if not os.path.exists(self.log_file_path):
                return

            file_size_mb = os.path.getsize(self.log_file_path) / (1024 * 1024)

            if file_size_mb >= LogSettings.MAX_LOG_SIZE_MB:
                # 백업 파일명 생성
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                backup_path = f"{self.log_file_path}.{timestamp}.bak"

                # 파일 백업
                shutil.copy2(self.log_file_path, backup_path)

                # 원본 파일 초기화
                with open(self.log_file_path, 'w', encoding='utf-8') as f:
                    f.write(f"[{datetime.now().strftime(LogSettings.TIMESTAMP_FORMAT)}] "
                            f"INFO: 로그 로테이션 - 이전 로그: {backup_path}\n")

                print(f"로그 파일 로테이션: {backup_path}")

                # 오래된 백업 파일 삭제
                self._cleanup_old_backups()

        except Exception as e:
            print(f"로그 로테이션 실패: {e}")

    def _cleanup_old_backups(self) -> None:
        """오래된 백업 파일 삭제 (최근 N개만 보관)"""
        try:
            log_dir = os.path.dirname(self.log_file_path)
            log_basename = os.path.basename(self.log_file_path)

            # 백업 파일 목록 가져오기
            backup_files = []
            for filename in os.listdir(log_dir):
                if filename.startswith(log_basename) and filename.endswith('.bak'):
                    backup_path = os.path.join(log_dir, filename)
                    backup_files.append((backup_path, os.path.getmtime(backup_path)))

            # 수정 시간 기준 정렬 (최신순)
            backup_files.sort(key=lambda x: x[1], reverse=True)

            # 오래된 파일 삭제 (최근 N개만 보관)
            for backup_path, _ in backup_files[LogSettings.MAX_LOG_FILES:]:
                os.remove(backup_path)
                print(f"오래된 백업 파일 삭제: {backup_path}")

        except Exception as e:
            print(f"백업 파일 정리 실패: {e}")

    def get_log_file_size_mb(self) -> float:
        """현재 로그 파일 크기 반환 (MB)

        Returns:
            float: 파일 크기 (MB)
        """
        try:
            if os.path.exists(self.log_file_path):
                return os.path.getsize(self.log_file_path) / (1024 * 1024)
        except Exception:
            pass
        return 0.0

    def clear_log(self) -> bool:
        """로그 파일 내용 지우기

        Returns:
            bool: 성공 여부
        """
        try:
            with self.lock:
                with open(self.log_file_path, 'w', encoding='utf-8') as f:
                    timestamp = datetime.now().strftime(LogSettings.TIMESTAMP_FORMAT)
                    f.write(f"[{timestamp}] INFO: 로그 지움\n")

                self.event_count = 0
                self.tracked_files.clear()

            print("로그 파일 내용을 지웠습니다.")
            return True

        except Exception as e:
            print(f"로그 지우기 실패: {e}")
            return False

    def open_log_file(self) -> bool:
        """로그 파일을 시스템 기본 프로그램으로 열기

        Returns:
            bool: 성공 여부
        """
        try:
            if os.path.exists(self.log_file_path):
                if os.name == 'nt':  # Windows
                    os.startfile(self.log_file_path)
                elif os.name == 'posix':  # Linux/Mac
                    os.system(f'xdg-open "{self.log_file_path}"')
                return True
            else:
                print("로그 파일이 존재하지 않습니다.")
                return False

        except Exception as e:
            print(f"로그 파일 열기 실패: {e}")
            return False


if __name__ == "__main__":
    # 로거 테스트
    print("=== FileLogger 테스트 ===\n")

    # 테스트용 로거 생성
    logger = FileLogger()

    # 모니터링 시작
    logger.start_monitoring()

    # 이벤트 로그 기록
    logger.log_event(EventType.FILE_OPEN, "C:\\Users\\test\\Documents\\보고서.xlsx")
    logger.track_file("C:\\Users\\test\\Documents\\보고서.xlsx")

    logger.log_event(EventType.CELL_CHANGE, "보고서.xlsx!Sheet1!A1 = \"Hello\"")
    logger.log_event(EventType.PASTE, "보고서.xlsx!Sheet1!B2:B10 (8 cells)")
    logger.log_event(EventType.FORMULA_CHANGE, "보고서.xlsx!Sheet1!C1 = \"=SUM(A1:A10)\"")
    logger.log_event(EventType.FILE_SAVE, "C:\\Users\\test\\Documents\\보고서.xlsx (성공)")

    logger.log_event(EventType.FILE_CLOSE, "C:\\Users\\test\\Documents\\보고서.xlsx")
    logger.untrack_file("C:\\Users\\test\\Documents\\보고서.xlsx")

    # 통계 출력
    print("\n=== 통계 ===")
    stats = logger.get_stats()
    for key, value in stats.items():
        if key != "tracked_files":
            print(f"{key}: {value}")

    # 모니터링 중지
    logger.stop_monitoring()

    print(f"\n로그 파일 크기: {logger.get_log_file_size_mb():.2f} MB")
