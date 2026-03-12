"""
Excel Monitor - 시간 관련 유틸리티

시간 포맷팅 및 변환 함수들
"""

from datetime import datetime, timedelta
from typing import Optional


def get_timestamp(format_string: str = "%Y-%m-%d %H:%M:%S") -> str:
    """현재 시간의 타임스탬프 반환

    Args:
        format_string: 시간 포맷 문자열

    Returns:
        str: 포맷팅된 타임스탬프
    """
    return datetime.now().strftime(format_string)


def get_date_string(format_string: str = "%Y-%m-%d") -> str:
    """현재 날짜 문자열 반환

    Args:
        format_string: 날짜 포맷 문자열

    Returns:
        str: 포맷팅된 날짜
    """
    return datetime.now().strftime(format_string)


def get_time_string(format_string: str = "%H:%M:%S") -> str:
    """현재 시간 문자열 반환

    Args:
        format_string: 시간 포맷 문자열

    Returns:
        str: 포맷팅된 시간
    """
    return datetime.now().strftime(format_string)


def format_datetime(dt: datetime, format_string: str = "%Y-%m-%d %H:%M:%S") -> str:
    """datetime 객체를 문자열로 변환

    Args:
        dt: datetime 객체
        format_string: 포맷 문자열

    Returns:
        str: 포맷팅된 문자열
    """
    return dt.strftime(format_string)


def parse_datetime(date_string: str, format_string: str = "%Y-%m-%d %H:%M:%S") -> Optional[datetime]:
    """문자열을 datetime 객체로 변환

    Args:
        date_string: 날짜 문자열
        format_string: 포맷 문자열

    Returns:
        Optional[datetime]: datetime 객체 또는 None (실패 시)
    """
    try:
        return datetime.strptime(date_string, format_string)
    except ValueError:
        return None


def get_elapsed_time(start_time: datetime, end_time: datetime = None) -> timedelta:
    """경과 시간 계산

    Args:
        start_time: 시작 시간
        end_time: 종료 시간 (None이면 현재 시간)

    Returns:
        timedelta: 경과 시간
    """
    if end_time is None:
        end_time = datetime.now()

    return end_time - start_time


def format_elapsed_time(start_time: datetime, end_time: datetime = None) -> str:
    """경과 시간을 문자열로 포맷팅

    Args:
        start_time: 시작 시간
        end_time: 종료 시간 (None이면 현재 시간)

    Returns:
        str: 포맷팅된 경과 시간 (예: "1시간 30분 45초")
    """
    elapsed = get_elapsed_time(start_time, end_time)
    return format_timedelta(elapsed)


def format_timedelta(td: timedelta) -> str:
    """timedelta를 읽기 쉬운 문자열로 변환

    Args:
        td: timedelta 객체

    Returns:
        str: 포맷팅된 문자열 (예: "1시간 30분 45초")
    """
    total_seconds = int(td.total_seconds())

    if total_seconds < 0:
        return "0초"

    if total_seconds == 0:
        return "0초"

    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60

    parts = []
    if hours > 0:
        parts.append(f"{hours}시간")
    if minutes > 0:
        parts.append(f"{minutes}분")
    if seconds > 0 or not parts:  # 0초도 표시 (parts가 비어있을 때)
        parts.append(f"{seconds}초")

    return " ".join(parts)


def format_duration_short(seconds: int) -> str:
    """시간을 짧은 형식으로 포맷팅

    Args:
        seconds: 초 단위 시간

    Returns:
        str: 짧은 포맷 (예: "01:30:45")
    """
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60

    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def is_today(dt: datetime) -> bool:
    """주어진 날짜가 오늘인지 확인

    Args:
        dt: datetime 객체

    Returns:
        bool: 오늘이면 True
    """
    return dt.date() == datetime.now().date()


def is_within_hours(dt: datetime, hours: int) -> bool:
    """주어진 시간이 N시간 이내인지 확인

    Args:
        dt: datetime 객체
        hours: 시간

    Returns:
        bool: N시간 이내이면 True
    """
    elapsed = datetime.now() - dt
    return elapsed.total_seconds() <= hours * 3600


def get_relative_time_string(dt: datetime) -> str:
    """상대적 시간 문자열 반환

    Args:
        dt: datetime 객체

    Returns:
        str: 상대 시간 (예: "5분 전", "2시간 전", "어제")
    """
    now = datetime.now()
    elapsed = now - dt

    seconds = int(elapsed.total_seconds())

    if seconds < 60:
        return f"{seconds}초 전"

    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}분 전"

    hours = minutes // 60
    if hours < 24:
        return f"{hours}시간 전"

    days = hours // 24
    if days == 1:
        return "어제"
    elif days < 7:
        return f"{days}일 전"
    elif days < 30:
        weeks = days // 7
        return f"{weeks}주 전"
    elif days < 365:
        months = days // 30
        return f"{months}개월 전"
    else:
        years = days // 365
        return f"{years}년 전"


def get_log_filename(prefix: str = "excel_monitor", extension: str = "log") -> str:
    """날짜 기반 로그 파일명 생성

    Args:
        prefix: 파일명 접두사
        extension: 파일 확장자

    Returns:
        str: 파일명 (예: "excel_monitor_2025-02-20.log")
    """
    date_str = get_date_string("%Y-%m-%d")
    return f"{prefix}_{date_str}.{extension}"


def get_backup_filename(original_filename: str) -> str:
    """백업 파일명 생성

    Args:
        original_filename: 원본 파일명

    Returns:
        str: 백업 파일명 (예: "file.log.20250220_143015.bak")
    """
    timestamp = get_timestamp("%Y%m%d_%H%M%S")
    return f"{original_filename}.{timestamp}.bak"


if __name__ == "__main__":
    # 시간 유틸리티 테스트
    print("=== TimeUtils 테스트 ===\n")

    # 현재 시간
    print("1. 현재 시간:")
    print(f"  타임스탬프: {get_timestamp()}")
    print(f"  날짜: {get_date_string()}")
    print(f"  시간: {get_time_string()}")

    # 경과 시간
    print("\n2. 경과 시간:")
    start = datetime.now() - timedelta(hours=1, minutes=30, seconds=45)
    print(f"  {format_elapsed_time(start)}")

    # timedelta 포맷팅
    print("\n3. timedelta 포맷팅:")
    print(f"  45초: {format_timedelta(timedelta(seconds=45))}")
    print(f"  90분: {format_timedelta(timedelta(minutes=90))}")
    print(f"  3665초: {format_timedelta(timedelta(seconds=3665))}")

    # 짧은 포맷
    print("\n4. 짧은 포맷:")
    print(f"  3665초: {format_duration_short(3665)}")

    # 상대 시간
    print("\n5. 상대 시간:")
    print(f"  5분 전: {get_relative_time_string(datetime.now() - timedelta(minutes=5))}")
    print(f"  2시간 전: {get_relative_time_string(datetime.now() - timedelta(hours=2))}")
    print(f"  1일 전: {get_relative_time_string(datetime.now() - timedelta(days=1))}")
    print(f"  10일 전: {get_relative_time_string(datetime.now() - timedelta(days=10))}")

    # 파일명 생성
    print("\n6. 파일명 생성:")
    print(f"  로그: {get_log_filename()}")
    print(f"  백업: {get_backup_filename('test.log')}")
