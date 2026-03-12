"""
Excel Monitor - 경로 관련 유틸리티

파일 경로 처리 및 변환 함수들
"""

import os
from typing import Optional


def get_filename(file_path: str) -> str:
    """파일명 추출 (확장자 포함)

    Args:
        file_path: 파일 경로

    Returns:
        str: 파일명
    """
    return os.path.basename(file_path)


def get_filename_without_ext(file_path: str) -> str:
    """파일명 추출 (확장자 제외)

    Args:
        file_path: 파일 경로

    Returns:
        str: 확장자 없는 파일명
    """
    filename = os.path.basename(file_path)
    return os.path.splitext(filename)[0]


def get_file_extension(file_path: str) -> str:
    """파일 확장자 추출

    Args:
        file_path: 파일 경로

    Returns:
        str: 확장자 (점 포함, 예: ".xlsx")
    """
    return os.path.splitext(file_path)[1]


def get_directory(file_path: str) -> str:
    """디렉토리 경로 추출

    Args:
        file_path: 파일 경로

    Returns:
        str: 디렉토리 경로
    """
    return os.path.dirname(file_path)


def shorten_path(file_path: str, max_length: int = 60) -> str:
    """긴 경로를 단축

    Args:
        file_path: 파일 경로
        max_length: 최대 길이

    Returns:
        str: 단축된 경로
    """
    if len(file_path) <= max_length:
        return file_path

    # 파일명 추출
    filename = os.path.basename(file_path)
    dirname = os.path.dirname(file_path)

    # Windows 드라이브 처리
    drive = ""
    if os.name == 'nt' and ':' in dirname:
        drive = dirname.split(':')[0] + ':'
        dirname = dirname[len(drive):]

    # 경로 단축
    remaining_length = max_length - len(filename) - len(drive) - 4  # "..." + sep

    if remaining_length > 0:
        # 뒤쪽 일부 경로 유지
        if len(dirname) > remaining_length:
            dirname = "..." + dirname[-remaining_length:]
        return os.path.join(drive + dirname, filename)
    else:
        # 파일명만 표시
        if len(filename) > max_length - 3:
            return "..." + filename[-(max_length - 3):]
        return filename


def normalize_path(file_path: str) -> str:
    """경로 정규화 (슬래시 통일, 상대 경로 해결)

    Args:
        file_path: 파일 경로

    Returns:
        str: 정규화된 경로
    """
    return os.path.normpath(file_path)


def get_absolute_path(file_path: str) -> str:
    """절대 경로로 변환

    Args:
        file_path: 파일 경로

    Returns:
        str: 절대 경로
    """
    return os.path.abspath(file_path)


def get_relative_path(file_path: str, base_path: str = None) -> str:
    """상대 경로로 변환

    Args:
        file_path: 파일 경로
        base_path: 기준 경로 (None이면 현재 디렉토리)

    Returns:
        str: 상대 경로
    """
    if base_path is None:
        base_path = os.getcwd()

    try:
        return os.path.relpath(file_path, base_path)
    except ValueError:
        # 다른 드라이브인 경우 (Windows)
        return file_path


def ensure_directory_exists(directory: str) -> bool:
    """디렉토리가 없으면 생성

    Args:
        directory: 디렉토리 경로

    Returns:
        bool: 성공 여부
    """
    try:
        os.makedirs(directory, exist_ok=True)
        return True
    except Exception as e:
        print(f"디렉토리 생성 실패: {e}")
        return False


def is_file_exists(file_path: str) -> bool:
    """파일 존재 여부 확인

    Args:
        file_path: 파일 경로

    Returns:
        bool: 존재하면 True
    """
    return os.path.isfile(file_path)


def is_directory_exists(directory: str) -> bool:
    """디렉토리 존재 여부 확인

    Args:
        directory: 디렉토리 경로

    Returns:
        bool: 존재하면 True
    """
    return os.path.isdir(directory)


def get_file_size(file_path: str) -> Optional[int]:
    """파일 크기 반환 (바이트)

    Args:
        file_path: 파일 경로

    Returns:
        Optional[int]: 파일 크기 (바이트) 또는 None (파일이 없는 경우)
    """
    try:
        return os.path.getsize(file_path)
    except Exception:
        return None


def get_file_size_mb(file_path: str) -> Optional[float]:
    """파일 크기 반환 (MB)

    Args:
        file_path: 파일 경로

    Returns:
        Optional[float]: 파일 크기 (MB) 또는 None
    """
    size_bytes = get_file_size(file_path)
    if size_bytes is not None:
        return size_bytes / (1024 * 1024)
    return None


def join_paths(*paths) -> str:
    """경로 결합

    Args:
        *paths: 결합할 경로들

    Returns:
        str: 결합된 경로
    """
    return os.path.join(*paths)


def split_path(file_path: str) -> tuple:
    """경로를 디렉토리와 파일명으로 분리

    Args:
        file_path: 파일 경로

    Returns:
        tuple: (디렉토리, 파일명)
    """
    return os.path.split(file_path)


def get_parent_directory(file_path: str, levels: int = 1) -> str:
    """상위 디렉토리 경로 반환

    Args:
        file_path: 파일 경로
        levels: 올라갈 레벨 수

    Returns:
        str: 상위 디렉토리 경로
    """
    result = file_path
    for _ in range(levels):
        result = os.path.dirname(result)
    return result


def is_excel_file(file_path: str) -> bool:
    """Excel 파일인지 확인

    Args:
        file_path: 파일 경로

    Returns:
        bool: Excel 파일이면 True
    """
    excel_extensions = ['.xlsx', '.xlsm', '.xlsb', '.xls']
    ext = get_file_extension(file_path).lower()
    return ext in excel_extensions


def get_safe_filename(filename: str) -> str:
    """안전한 파일명으로 변환 (특수문자 제거)

    Args:
        filename: 원본 파일명

    Returns:
        str: 안전한 파일명
    """
    # Windows에서 사용할 수 없는 문자
    invalid_chars = '<>:"/\\|?*'

    safe_name = filename
    for char in invalid_chars:
        safe_name = safe_name.replace(char, '_')

    return safe_name


def get_unique_filename(file_path: str) -> str:
    """중복되지 않는 파일명 생성

    Args:
        file_path: 원본 파일 경로

    Returns:
        str: 고유한 파일 경로
    """
    if not os.path.exists(file_path):
        return file_path

    directory = os.path.dirname(file_path)
    filename = os.path.basename(file_path)
    name, ext = os.path.splitext(filename)

    counter = 1
    while True:
        new_filename = f"{name}_{counter}{ext}"
        new_path = os.path.join(directory, new_filename)

        if not os.path.exists(new_path):
            return new_path

        counter += 1


if __name__ == "__main__":
    # 경로 유틸리티 테스트
    print("=== PathUtils 테스트 ===\n")

    test_path = "C:\\Users\\username\\Documents\\Projects\\Excel\\보고서.xlsx"

    # 파일명 추출
    print("1. 파일명 추출:")
    print(f"  전체: {get_filename(test_path)}")
    print(f"  확장자 제외: {get_filename_without_ext(test_path)}")
    print(f"  확장자: {get_file_extension(test_path)}")

    # 디렉토리
    print("\n2. 디렉토리:")
    print(f"  디렉토리: {get_directory(test_path)}")

    # 경로 단축
    print("\n3. 경로 단축:")
    long_path = "C:\\Users\\username\\Documents\\Projects\\Excel\\Reports\\Monthly\\2025\\Q1\\January\\보고서_최종_수정본_v3.xlsx"
    print(f"  원본 ({len(long_path)}자): {long_path}")
    print(f"  단축 (60자): {shorten_path(long_path, 60)}")
    print(f"  단축 (40자): {shorten_path(long_path, 40)}")

    # Excel 파일 확인
    print("\n4. Excel 파일 확인:")
    print(f"  보고서.xlsx: {is_excel_file('보고서.xlsx')}")
    print(f"  문서.docx: {is_excel_file('문서.docx')}")
    print(f"  data.xlsm: {is_excel_file('data.xlsm')}")

    # 안전한 파일명
    print("\n5. 안전한 파일명:")
    unsafe = "보고서:최종*수정본?.xlsx"
    print(f"  원본: {unsafe}")
    print(f"  변환: {get_safe_filename(unsafe)}")

    # 경로 결합
    print("\n6. 경로 결합:")
    print(f"  {join_paths('C:', 'Users', 'username', 'Documents', '보고서.xlsx')}")
