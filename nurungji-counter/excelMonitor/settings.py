"""
Excel Monitor - 사용자 설정 관리

사용자 설정을 JSON 파일로 저장하고 로드하는 기능 제공
"""

import json
import os
from typing import Dict, Any
from .config import (
    SETTINGS_FILE,
    get_default_log_directory,
    MonitorSettings,
    EventType
)


class SettingsManager:
    """사용자 설정 관리 클래스"""

    def __init__(self, settings_file: str = None):
        """
        Args:
            settings_file: 설정 파일 경로 (None이면 현재 디렉토리의 settings.json 사용)
        """
        if settings_file is None:
            # 실행 파일과 같은 디렉토리에 저장
            self.settings_file = os.path.join(os.getcwd(), SETTINGS_FILE)
        else:
            self.settings_file = settings_file

        self.settings = self._get_default_settings()

    def _get_default_settings(self) -> Dict[str, Any]:
        """기본 설정 반환"""
        return {
            "monitoring_enabled": False,
            "auto_start": False,
            "log_directory": get_default_log_directory(),
            "enabled_events": MonitorSettings.DEFAULT_ENABLED_EVENTS.copy(),
            "max_log_size_mb": 100,
            "log_rotation": True,
            "stats_update_interval": MonitorSettings.STATS_UPDATE_INTERVAL,
        }

    def load_settings(self) -> Dict[str, Any]:
        """설정 파일에서 설정 로드

        Returns:
            Dict[str, Any]: 설정 딕셔너리
        """
        try:
            if os.path.exists(self.settings_file):
                with open(self.settings_file, 'r', encoding='utf-8') as f:
                    loaded_settings = json.load(f)

                # 기본 설정과 병합 (새로운 설정 키가 추가된 경우 대비)
                self.settings.update(loaded_settings)
                print(f"설정 파일 로드 완료: {self.settings_file}")
            else:
                print(f"설정 파일이 없습니다. 기본 설정을 사용합니다: {self.settings_file}")
                # 기본 설정으로 파일 생성
                self.save_settings(self.settings)

        except Exception as e:
            print(f"설정 파일 로드 실패: {e}")
            print("기본 설정을 사용합니다.")

        return self.settings

    def save_settings(self, settings: Dict[str, Any] = None) -> bool:
        """설정을 파일에 저장

        Args:
            settings: 저장할 설정 딕셔너리 (None이면 현재 설정 저장)

        Returns:
            bool: 성공 여부
        """
        if settings is not None:
            self.settings = settings

        try:
            with open(self.settings_file, 'w', encoding='utf-8') as f:
                json.dump(self.settings, f, ensure_ascii=False, indent=2)
            print(f"설정 파일 저장 완료: {self.settings_file}")
            return True

        except Exception as e:
            print(f"설정 파일 저장 실패: {e}")
            return False

    def get(self, key: str, default: Any = None) -> Any:
        """설정 값 가져오기

        Args:
            key: 설정 키
            default: 기본값

        Returns:
            Any: 설정 값
        """
        return self.settings.get(key, default)

    def set(self, key: str, value: Any) -> None:
        """설정 값 변경

        Args:
            key: 설정 키
            value: 설정 값
        """
        self.settings[key] = value

    def get_enabled_events(self) -> Dict[str, bool]:
        """활성화된 이벤트 목록 반환

        Returns:
            Dict[str, bool]: 이벤트 타입별 활성화 상태
        """
        return self.settings.get("enabled_events", MonitorSettings.DEFAULT_ENABLED_EVENTS)

    def is_event_enabled(self, event_type: str) -> bool:
        """특정 이벤트가 활성화되어 있는지 확인

        Args:
            event_type: 이벤트 타입 (EventType 상수)

        Returns:
            bool: 활성화 여부
        """
        enabled_events = self.get_enabled_events()
        return enabled_events.get(event_type, True)

    def set_event_enabled(self, event_type: str, enabled: bool) -> None:
        """특정 이벤트 활성화 상태 변경

        Args:
            event_type: 이벤트 타입 (EventType 상수)
            enabled: 활성화 여부
        """
        if "enabled_events" not in self.settings:
            self.settings["enabled_events"] = MonitorSettings.DEFAULT_ENABLED_EVENTS.copy()

        self.settings["enabled_events"][event_type] = enabled

    def get_log_directory(self) -> str:
        """로그 디렉토리 경로 반환

        Returns:
            str: 로그 디렉토리 경로
        """
        return self.settings.get("log_directory", get_default_log_directory())

    def set_log_directory(self, directory: str) -> None:
        """로그 디렉토리 경로 설정

        Args:
            directory: 로그 디렉토리 경로
        """
        self.settings["log_directory"] = directory

    def reset_to_defaults(self) -> None:
        """설정을 기본값으로 초기화"""
        self.settings = self._get_default_settings()
        self.save_settings()
        print("설정이 기본값으로 초기화되었습니다.")


# 전역 설정 관리자 인스턴스
_settings_manager = None


def get_settings_manager(settings_file: str = None) -> SettingsManager:
    """전역 설정 관리자 인스턴스 반환 (싱글톤 패턴)

    Args:
        settings_file: 설정 파일 경로 (첫 호출 시에만 사용됨)

    Returns:
        SettingsManager: 설정 관리자 인스턴스
    """
    global _settings_manager
    if _settings_manager is None:
        _settings_manager = SettingsManager(settings_file)
        _settings_manager.load_settings()
    return _settings_manager


if __name__ == "__main__":
    # 설정 관리자 테스트
    manager = SettingsManager("test_settings.json")

    # 기본 설정 저장
    print("\n=== 기본 설정 저장 ===")
    manager.save_settings()

    # 설정 로드
    print("\n=== 설정 로드 ===")
    settings = manager.load_settings()
    print(json.dumps(settings, ensure_ascii=False, indent=2))

    # 설정 변경
    print("\n=== 설정 변경 ===")
    manager.set("auto_start", True)
    manager.set_event_enabled(EventType.FILE_OPEN, False)
    manager.save_settings()

    # 변경된 설정 확인
    print("\n=== 변경된 설정 확인 ===")
    print(f"auto_start: {manager.get('auto_start')}")
    print(f"FILE_OPEN 활성화: {manager.is_event_enabled(EventType.FILE_OPEN)}")

    # 테스트 파일 삭제
    if os.path.exists("test_settings.json"):
        os.remove("test_settings.json")
        print("\n테스트 파일 삭제 완료")
