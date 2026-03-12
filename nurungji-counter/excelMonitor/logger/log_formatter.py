"""
Excel Monitor - 로그 포맷팅 유틸리티

로그 메시지를 읽기 쉽게 포맷팅하는 함수들
"""

import os
from typing import Any, Optional


class LogFormatter:
    """로그 포맷팅 유틸리티 클래스"""

    # 값 표시 최대 길이
    MAX_VALUE_LENGTH = 100
    MAX_PATH_LENGTH = 60

    @staticmethod
    def format_cell_value(value: Any, max_length: int = None) -> str:
        """셀 값 포맷팅

        Args:
            value: 셀 값
            max_length: 최대 길이 (None이면 기본값 사용)

        Returns:
            str: 포맷팅된 값
        """
        if max_length is None:
            max_length = LogFormatter.MAX_VALUE_LENGTH

        if value is None:
            return "<비어있음>"

        # 값을 문자열로 변환
        str_value = str(value)

        # 줄바꿈 제거 및 공백 정리
        str_value = ' '.join(str_value.split())

        # 길이 제한
        if len(str_value) > max_length:
            str_value = str_value[:max_length] + "..."

        # 특수 문자 이스케이프
        str_value = str_value.replace('\n', '\\n').replace('\t', '\\t')

        return f'"{str_value}"'

    @staticmethod
    def format_formula(formula: str, value: Any = None) -> str:
        """수식 포맷팅

        Args:
            formula: 수식 문자열
            value: 수식 계산 결과 (선택사항)

        Returns:
            str: 포맷팅된 수식
        """
        # 줄바꿈 제거
        formula = ' '.join(formula.split())

        # 길이 제한
        if len(formula) > LogFormatter.MAX_VALUE_LENGTH:
            formula = formula[:LogFormatter.MAX_VALUE_LENGTH] + "..."

        # 결과 값이 있으면 함께 표시
        if value is not None:
            result = LogFormatter.format_cell_value(value, 50)
            return f'"{formula}" → {result}'
        else:
            return f'"{formula}"'

    @staticmethod
    def format_file_path(file_path: str, max_length: int = None) -> str:
        """파일 경로 포맷팅 (긴 경로 단축)

        Args:
            file_path: 파일 경로
            max_length: 최대 길이 (None이면 기본값 사용)

        Returns:
            str: 포맷팅된 경로
        """
        if max_length is None:
            max_length = LogFormatter.MAX_PATH_LENGTH

        if len(file_path) <= max_length:
            return file_path

        # 파일명과 확장자 추출
        filename = os.path.basename(file_path)
        dirname = os.path.dirname(file_path)

        # 드라이브 추출 (Windows)
        if ':' in dirname:
            drive = dirname.split(':')[0] + ':'
            dirname = dirname.split(':', 1)[1]
        else:
            drive = ''

        # 경로 단축
        remaining_length = max_length - len(filename) - len(drive) - 4  # "...\" 포함
        if remaining_length > 0:
            # 경로 앞부분 단축
            return f"{drive}...{dirname[-remaining_length:]}{os.sep}{filename}"
        else:
            # 파일명만 표시
            if len(filename) > max_length - 3:
                return f"...{filename[-(max_length-3):]}"
            return filename

    @staticmethod
    def format_cell_address(workbook_name: str, sheet_name: str, cell_address: str) -> str:
        """셀 주소 포맷팅

        Args:
            workbook_name: 워크북 이름
            sheet_name: 시트 이름
            cell_address: 셀 주소

        Returns:
            str: 포맷팅된 주소 (예: "보고서.xlsx!Sheet1!A1")
        """
        # 시트 이름에 공백이나 특수문자가 있으면 작은따옴표로 감싸기
        if ' ' in sheet_name or '!' in sheet_name:
            sheet_name = f"'{sheet_name}'"

        return f"{workbook_name}!{sheet_name}!{cell_address}"

    @staticmethod
    def format_cell_range(cell_count: int, cell_address: str = None) -> str:
        """셀 범위 포맷팅

        Args:
            cell_count: 셀 개수
            cell_address: 셀 범위 주소 (선택사항)

        Returns:
            str: 포맷팅된 범위 정보
        """
        if cell_address:
            return f"{cell_address} ({cell_count} cells)"
        else:
            return f"({cell_count} cells)"

    @staticmethod
    def format_file_size(size_bytes: int) -> str:
        """파일 크기 포맷팅

        Args:
            size_bytes: 바이트 단위 크기

        Returns:
            str: 포맷팅된 크기 (예: "1.5 MB")
        """
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.1f} TB"

    @staticmethod
    def format_duration(seconds: int) -> str:
        """시간 포맷팅

        Args:
            seconds: 초 단위 시간

        Returns:
            str: 포맷팅된 시간 (예: "1시간 30분 45초")
        """
        if seconds < 60:
            return f"{seconds}초"

        minutes = seconds // 60
        seconds = seconds % 60

        if minutes < 60:
            if seconds > 0:
                return f"{minutes}분 {seconds}초"
            else:
                return f"{minutes}분"

        hours = minutes // 60
        minutes = minutes % 60

        parts = [f"{hours}시간"]
        if minutes > 0:
            parts.append(f"{minutes}분")
        if seconds > 0:
            parts.append(f"{seconds}초")

        return " ".join(parts)

    @staticmethod
    def format_data_type(value: Any) -> str:
        """데이터 타입 문자열 반환

        Args:
            value: 값

        Returns:
            str: 데이터 타입 (텍스트, 숫자, 날짜, 수식 등)
        """
        if value is None:
            return "빈 셀"

        value_type = type(value).__name__

        if value_type in ['int', 'float']:
            return "숫자"
        elif value_type == 'str':
            # 날짜 형식 체크 (간단한 패턴)
            if '/' in value or '-' in value:
                # YYYY-MM-DD 또는 MM/DD/YYYY 패턴
                parts = value.replace('/', '-').split('-')
                if len(parts) == 3 and all(p.isdigit() for p in parts):
                    return "날짜"
            return "텍스트"
        elif value_type == 'bool':
            return "불린"
        elif value_type == 'datetime':
            return "날짜/시간"
        else:
            return value_type

    @staticmethod
    def format_event_message(event_type: str, workbook_name: str, sheet_name: str = None,
                            cell_address: str = None, value: Any = None,
                            extra_info: str = None) -> str:
        """이벤트 메시지 포맷팅 (통합)

        Args:
            event_type: 이벤트 타입
            workbook_name: 워크북 이름
            sheet_name: 시트 이름 (선택사항)
            cell_address: 셀 주소 (선택사항)
            value: 값 (선택사항)
            extra_info: 추가 정보 (선택사항)

        Returns:
            str: 포맷팅된 메시지
        """
        parts = [workbook_name]

        if sheet_name:
            parts.append(sheet_name)

        if cell_address:
            parts.append(cell_address)

        location = "!".join(parts)

        if value is not None:
            formatted_value = LogFormatter.format_cell_value(value)
            message = f"{location} = {formatted_value}"
        else:
            message = location

        if extra_info:
            message += f" ({extra_info})"

        return message

    @staticmethod
    def truncate_string(text: str, max_length: int, suffix: str = "...") -> str:
        """문자열 자르기

        Args:
            text: 원본 문자열
            max_length: 최대 길이
            suffix: 자를 때 추가할 접미사

        Returns:
            str: 자른 문자열
        """
        if len(text) <= max_length:
            return text

        return text[:max_length - len(suffix)] + suffix

    @staticmethod
    def format_list(items: list, max_items: int = 5, separator: str = ", ") -> str:
        """리스트 포맷팅

        Args:
            items: 아이템 리스트
            max_items: 표시할 최대 아이템 수
            separator: 구분자

        Returns:
            str: 포맷팅된 문자열
        """
        if len(items) <= max_items:
            return separator.join(str(item) for item in items)

        shown_items = separator.join(str(item) for item in items[:max_items])
        remaining = len(items) - max_items
        return f"{shown_items} 외 {remaining}개"


# 편의 함수들
def format_value(value: Any) -> str:
    """셀 값 포맷팅 (단축 함수)"""
    return LogFormatter.format_cell_value(value)


def format_path(file_path: str) -> str:
    """파일 경로 포맷팅 (단축 함수)"""
    return LogFormatter.format_file_path(file_path)


def format_address(workbook_name: str, sheet_name: str, cell_address: str) -> str:
    """셀 주소 포맷팅 (단축 함수)"""
    return LogFormatter.format_cell_address(workbook_name, sheet_name, cell_address)


if __name__ == "__main__":
    # 포맷터 테스트
    print("=== LogFormatter 테스트 ===\n")

    # 값 포맷팅
    print("1. 값 포맷팅:")
    print(f"  짧은 값: {format_value('Hello')}")
    print(f"  긴 값: {format_value('A' * 150)}")
    print(f"  None: {format_value(None)}")
    print(f"  숫자: {format_value(12345.67)}")

    # 수식 포맷팅
    print("\n2. 수식 포맷팅:")
    print(f"  기본: {LogFormatter.format_formula('=SUM(A1:A10)')}")
    print(f"  결과 포함: {LogFormatter.format_formula('=SUM(A1:A10)', 55)}")

    # 경로 포맷팅
    print("\n3. 경로 포맷팅:")
    long_path = "C:\\Users\\username\\Documents\\Projects\\Excel\\Reports\\Monthly\\2025\\보고서.xlsx"
    print(f"  긴 경로: {format_path(long_path)}")
    print(f"  짧은 경로: {format_path('C:\\Users\\보고서.xlsx')}")

    # 주소 포맷팅
    print("\n4. 주소 포맷팅:")
    print(f"  일반: {format_address('보고서.xlsx', 'Sheet1', 'A1')}")
    print(f"  공백 포함: {format_address('보고서.xlsx', 'My Sheet', 'B2:B10')}")

    # 범위 포맷팅
    print("\n5. 범위 포맷팅:")
    print(f"  {LogFormatter.format_cell_range(10, 'A1:A10')}")

    # 크기 포맷팅
    print("\n6. 파일 크기 포맷팅:")
    print(f"  {LogFormatter.format_file_size(1024)}")
    print(f"  {LogFormatter.format_file_size(1024 * 1024 * 1.5)}")

    # 시간 포맷팅
    print("\n7. 시간 포맷팅:")
    print(f"  {LogFormatter.format_duration(45)}")
    print(f"  {LogFormatter.format_duration(3665)}")

    # 데이터 타입
    print("\n8. 데이터 타입:")
    print(f"  {LogFormatter.format_data_type('Hello')}")
    print(f"  {LogFormatter.format_data_type(123)}")
    print(f"  {LogFormatter.format_data_type('2025-02-20')}")
    print(f"  {LogFormatter.format_data_type(None)}")
