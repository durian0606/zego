"""
Excel Monitor - Excel COM 이벤트 리스너

Excel의 COM 이벤트를 캡처하여 실시간으로 모니터링
"""

import time
from typing import Optional, Dict

# Windows COM 라이브러리 (Windows에서만 사용 가능)
try:
    import win32com.client
    import pythoncom
    COM_AVAILABLE = True
except ImportError:
    COM_AVAILABLE = False
    print("경고: pywin32가 설치되지 않았습니다. Windows에서만 Excel 모니터링이 가능합니다.")

from ..config import EventType, MonitorSettings
from ..logger import FileLogger
from ..logger.log_formatter import LogFormatter, format_address


class ExcelApplicationEvents:
    """Excel Application 레벨 이벤트 핸들러"""

    def __init__(self, listener: 'ExcelEventListener'):
        """
        Args:
            listener: ExcelEventListener 인스턴스
        """
        self.listener = listener

    def OnWorkbookOpen(self, Wb):
        """워크북 열기 이벤트

        Args:
            Wb: 열린 워크북 객체
        """
        try:
            file_path = Wb.FullName
            self.listener.logger.track_file(file_path)
            self.listener.logger.log_event(EventType.FILE_OPEN, file_path)

            # 워크북에 이벤트 핸들러 등록
            self.listener._register_workbook_events(Wb)

        except Exception as e:
            self.listener.logger.log_event(EventType.ERROR, f"WorkbookOpen 이벤트 처리 실패: {e}")

    def OnWorkbookBeforeSave(self, Wb, SaveAsUI, Cancel):
        """워크북 저장 전 이벤트

        Args:
            Wb: 워크북 객체
            SaveAsUI: 다른 이름으로 저장 여부
            Cancel: 취소 여부 (출력 매개변수)
        """
        try:
            if self.listener.settings_manager.is_event_enabled(EventType.FILE_SAVE_BEFORE):
                file_path = Wb.FullName
                save_type = "다른 이름으로 저장" if SaveAsUI else "저장"
                self.listener.logger.log_event(EventType.FILE_SAVE_BEFORE, f"{file_path} ({save_type})")

        except Exception as e:
            self.listener.logger.log_event(EventType.ERROR, f"WorkbookBeforeSave 이벤트 처리 실패: {e}")

    def OnWorkbookAfterSave(self, Wb, Success):
        """워크북 저장 후 이벤트

        Args:
            Wb: 워크북 객체
            Success: 저장 성공 여부
        """
        try:
            if self.listener.settings_manager.is_event_enabled(EventType.FILE_SAVE):
                file_path = Wb.FullName
                status = "성공" if Success else "실패"
                self.listener.logger.log_event(EventType.FILE_SAVE, f"{file_path} ({status})")

        except Exception as e:
            self.listener.logger.log_event(EventType.ERROR, f"WorkbookAfterSave 이벤트 처리 실패: {e}")

    def OnWorkbookBeforeClose(self, Wb, Cancel):
        """워크북 닫기 전 이벤트

        Args:
            Wb: 워크북 객체
            Cancel: 취소 여부 (출력 매개변수)
        """
        try:
            file_path = Wb.FullName
            self.listener.logger.log_event(EventType.FILE_CLOSE, file_path)
            self.listener.logger.untrack_file(file_path)

            # 워크북 이벤트 핸들러 제거
            self.listener._unregister_workbook_events(Wb)

        except Exception as e:
            self.listener.logger.log_event(EventType.ERROR, f"WorkbookBeforeClose 이벤트 처리 실패: {e}")

    def OnWorkbookBeforePrint(self, Wb, Cancel):
        """워크북 인쇄 전 이벤트

        Args:
            Wb: 워크북 객체
            Cancel: 취소 여부 (출력 매개변수)
        """
        try:
            if self.listener.settings_manager.is_event_enabled(EventType.PRINT):
                file_path = Wb.FullName
                self.listener.logger.log_event(EventType.PRINT, file_path)

        except Exception as e:
            self.listener.logger.log_event(EventType.ERROR, f"WorkbookBeforePrint 이벤트 처리 실패: {e}")


class WorkbookEvents:
    """Workbook 레벨 이벤트 핸들러"""

    def __init__(self, listener: 'ExcelEventListener', workbook):
        """
        Args:
            listener: ExcelEventListener 인스턴스
            workbook: 워크북 객체
        """
        self.listener = listener
        self.workbook = workbook
        self.workbook_name = workbook.Name

    def OnSheetChange(self, Sh, Target):
        """시트 셀 변경 이벤트 (가장 중요!) - Phase 2 고도화 버전

        Args:
            Sh: 시트 객체
            Target: 변경된 셀 범위 객체
        """
        try:
            if not self.listener.settings_manager.is_event_enabled(EventType.CELL_CHANGE):
                return

            sheet_name = Sh.Name
            cell_address = Target.Address
            cell_count = Target.Count

            # 셀 주소 포맷팅
            location = format_address(self.workbook_name, sheet_name, cell_address)

            if cell_count == 1:
                # === 단일 셀 변경 ===
                cell_value = Target.Value

                # 데이터 타입 감지
                data_type = LogFormatter.format_data_type(cell_value)

                # 수식인지 확인
                if Target.HasFormula:
                    # 수식 변경
                    if self.listener.settings_manager.is_event_enabled(EventType.FORMULA_CHANGE):
                        formula = Target.Formula
                        # 수식과 결과 값 함께 표시
                        formatted_formula = LogFormatter.format_formula(formula, cell_value)
                        message = f"{location} = {formatted_formula} [{data_type}]"
                        self.listener.logger.log_event(EventType.FORMULA_CHANGE, message)
                else:
                    # 일반 값 변경
                    formatted_value = LogFormatter.format_cell_value(cell_value)
                    message = f"{location} = {formatted_value} [{data_type}]"
                    self.listener.logger.log_event(EventType.CELL_CHANGE, message)

            else:
                # === 복수 셀 변경 (붙여넣기, 드래그 채우기 등) ===
                if self.listener.settings_manager.is_event_enabled(EventType.PASTE):
                    # 범위 정보
                    range_info = LogFormatter.format_cell_range(cell_count, cell_address)

                    # 범위가 작으면 일부 값 미리보기 추가
                    if cell_count <= 10:
                        try:
                            # 첫 번째 셀 값
                            first_cell = Target.Cells(1, 1)
                            first_value = LogFormatter.format_cell_value(first_cell.Value, 30)
                            preview = f" [첫 값: {first_value}]"
                        except:
                            preview = ""
                    else:
                        preview = ""

                    message = f"{location} {range_info}{preview}"
                    self.listener.logger.log_event(EventType.PASTE, message)

        except Exception as e:
            self.listener.logger.log_event(EventType.ERROR, f"SheetChange 이벤트 처리 실패: {e}")

    def OnNewSheet(self, Sh):
        """새 시트 추가 이벤트

        Args:
            Sh: 새로 추가된 시트 객체
        """
        try:
            if self.listener.settings_manager.is_event_enabled(EventType.SHEET_ADD):
                sheet_name = Sh.Name
                message = f"{self.workbook_name}: 시트 '{sheet_name}' 추가됨"
                self.listener.logger.log_event(EventType.SHEET_ADD, message)

        except Exception as e:
            self.listener.logger.log_event(EventType.ERROR, f"NewSheet 이벤트 처리 실패: {e}")

    def OnSheetActivate(self, Sh):
        """시트 활성화 이벤트 (Phase 2 - 기본 비활성화)

        Args:
            Sh: 활성화된 시트 객체
        """
        try:
            if self.listener.settings_manager.is_event_enabled(EventType.SHEET_ACTIVATE):
                sheet_name = Sh.Name
                message = f"{self.workbook_name}: 시트 '{sheet_name}' 활성화됨"
                self.listener.logger.log_event(EventType.SHEET_ACTIVATE, message)

        except Exception as e:
            self.listener.logger.log_event(EventType.ERROR, f"SheetActivate 이벤트 처리 실패: {e}")

    def OnSheetBeforeDelete(self, Sh):
        """시트 삭제 전 이벤트 (Phase 2)

        Args:
            Sh: 삭제될 시트 객체
        """
        try:
            if self.listener.settings_manager.is_event_enabled(EventType.SHEET_DELETE):
                sheet_name = Sh.Name
                message = f"{self.workbook_name}: 시트 '{sheet_name}' 삭제됨"
                self.listener.logger.log_event(EventType.SHEET_DELETE, message)

        except Exception as e:
            self.listener.logger.log_event(EventType.ERROR, f"SheetBeforeDelete 이벤트 처리 실패: {e}")

    def OnSheetCalculate(self, Sh):
        """시트 계산/재계산 이벤트 (Phase 2 - 기본 비활성화, 매우 빈번함)

        Args:
            Sh: 계산된 시트 객체
        """
        try:
            if self.listener.settings_manager.is_event_enabled(EventType.CALCULATE):
                sheet_name = Sh.Name
                message = f"{self.workbook_name}: 시트 '{sheet_name}' 재계산됨"
                self.listener.logger.log_event(EventType.CALCULATE, message)

        except Exception as e:
            self.listener.logger.log_event(EventType.ERROR, f"SheetCalculate 이벤트 처리 실패: {e}")


class ExcelEventListener:
    """Excel 이벤트 리스너 메인 클래스"""

    def __init__(self, logger: FileLogger, settings_manager, debug_mode: bool = False):
        """
        Args:
            logger: FileLogger 인스턴스
            settings_manager: SettingsManager 인스턴스
            debug_mode: 디버그 모드 활성화 여부 (Phase 2)
        """
        if not COM_AVAILABLE:
            raise RuntimeError("pywin32가 설치되지 않았습니다. Windows에서만 Excel 모니터링이 가능합니다.")

        self.logger = logger
        self.settings_manager = settings_manager
        self.debug_mode = debug_mode

        # Excel 관련 객체
        self.excel_app = None
        self.app_event_handler = None
        self.workbook_handlers: Dict[str, any] = {}  # 워크북별 이벤트 핸들러

        # 모니터링 상태
        self.is_monitoring = False

        # 에러 카운터 (Phase 2)
        self.error_count = 0
        self.max_errors = 100  # 최대 에러 수 (초과 시 경고)

        # 재시도 카운터
        self.retry_count = 0

    def start_monitoring(self) -> bool:
        """모니터링 시작

        Returns:
            bool: 성공 여부
        """
        try:
            if self.is_monitoring:
                print("이미 모니터링 중입니다.")
                return False

            # COM 초기화
            pythoncom.CoInitialize()

            # Excel 연결
            if not self._connect_to_excel():
                return False

            # Application 레벨 이벤트 핸들러 등록
            self.app_event_handler = win32com.client.WithEvents(
                self.excel_app,
                ExcelApplicationEvents
            )
            self.app_event_handler.listener = self

            # 이미 열려있는 워크북에 이벤트 핸들러 등록
            for workbook in self.excel_app.Workbooks:
                self._register_workbook_events(workbook)
                # 열려있는 파일 추적
                self.logger.track_file(workbook.FullName)
                self.logger.log_event(EventType.INFO, f"기존 파일 감지: {workbook.FullName}")

            self.is_monitoring = True
            self.logger.start_monitoring()

            print("Excel 모니터링 시작됨")
            return True

        except Exception as e:
            self._handle_error("모니터링 시작 실패", e, critical=True)
            return False

    def stop_monitoring(self) -> None:
        """모니터링 중지"""
        try:
            if not self.is_monitoring:
                print("모니터링이 실행되고 있지 않습니다.")
                return

            # 워크북 이벤트 핸들러 제거
            for workbook_name in list(self.workbook_handlers.keys()):
                self.workbook_handlers[workbook_name] = None

            self.workbook_handlers.clear()

            # Application 이벤트 핸들러 제거
            self.app_event_handler = None

            # Excel 참조 해제
            self.excel_app = None

            # COM 해제
            pythoncom.CoUninitialize()

            self.is_monitoring = False
            self.logger.stop_monitoring()

            print("Excel 모니터링 중지됨")

        except Exception as e:
            self._handle_error("모니터링 중지 실패", e, critical=False)

    def _connect_to_excel(self) -> bool:
        """Excel에 연결

        Returns:
            bool: 성공 여부
        """
        for attempt in range(MonitorSettings.COM_RETRY_COUNT):
            try:
                # 실행 중인 Excel 인스턴스에 연결
                self.excel_app = win32com.client.GetActiveObject("Excel.Application")
                print("실행 중인 Excel에 연결됨")
                return True

            except Exception:
                # Excel이 실행되지 않은 경우
                if attempt == 0:
                    print("Excel이 실행되지 않았습니다. Excel을 시작합니다...")

                try:
                    # 새 Excel 인스턴스 시작
                    self.excel_app = win32com.client.Dispatch("Excel.Application")
                    self.excel_app.Visible = True
                    print("새 Excel 인스턴스 시작됨")
                    return True

                except Exception as e:
                    if attempt < MonitorSettings.COM_RETRY_COUNT - 1:
                        print(f"Excel 연결 실패 ({attempt + 1}/{MonitorSettings.COM_RETRY_COUNT}): {e}")
                        time.sleep(MonitorSettings.COM_RETRY_DELAY)
                    else:
                        print(f"Excel 연결 최종 실패: {e}")
                        return False

        return False

    def _register_workbook_events(self, workbook) -> None:
        """워크북 이벤트 핸들러 등록

        Args:
            workbook: 워크북 객체
        """
        try:
            workbook_name = workbook.Name

            # 이미 등록되어 있으면 스킵
            if workbook_name in self.workbook_handlers:
                return

            # 워크북 이벤트 핸들러 생성 및 등록
            handler = win32com.client.WithEvents(workbook, WorkbookEvents)
            handler.listener = self
            handler.workbook = workbook

            self.workbook_handlers[workbook_name] = handler

            print(f"워크북 이벤트 핸들러 등록: {workbook_name}")

        except Exception as e:
            self._handle_error(f"워크북 이벤트 핸들러 등록 실패 ({workbook.Name if hasattr(workbook, 'Name') else 'Unknown'})", e)

    def _unregister_workbook_events(self, workbook) -> None:
        """워크북 이벤트 핸들러 제거

        Args:
            workbook: 워크북 객체
        """
        try:
            workbook_name = workbook.Name

            if workbook_name in self.workbook_handlers:
                self.workbook_handlers[workbook_name] = None
                del self.workbook_handlers[workbook_name]
                print(f"워크북 이벤트 핸들러 제거: {workbook_name}")

        except Exception as e:
            self._handle_error(f"워크북 이벤트 핸들러 제거 실패 ({workbook.Name if hasattr(workbook, 'Name') else 'Unknown'})", e)

    def pump_events(self, timeout: float = 0.1) -> None:
        """COM 이벤트 펌프 (메시지 루프)

        Args:
            timeout: 타임아웃 (초)
        """
        if self.is_monitoring and COM_AVAILABLE:
            try:
                pythoncom.PumpWaitingMessages()
                time.sleep(timeout)
            except Exception as e:
                self._handle_error("이벤트 펌프 실패", e, critical=False)

    # ===== Phase 2: 에러 처리 강화 =====

    def _handle_error(self, context: str, error: Exception, critical: bool = False) -> None:
        """통합 에러 처리 메서드 (Phase 2)

        Args:
            context: 에러 발생 컨텍스트
            error: 예외 객체
            critical: 치명적 에러 여부
        """
        self.error_count += 1

        # 에러 타입 확인
        error_type = type(error).__name__
        error_message = str(error)

        # 로그 메시지 생성
        if self.debug_mode:
            # 디버그 모드: 상세 정보 포함
            import traceback
            stack_trace = traceback.format_exc()
            log_message = f"{context}: [{error_type}] {error_message}\n{stack_trace}"
        else:
            # 일반 모드: 간단한 메시지
            log_message = f"{context}: [{error_type}] {error_message}"

        # 에러 로그 기록
        if critical:
            self.logger.log_event(EventType.ERROR, f"[치명적] {log_message}")
        else:
            self.logger.log_event(EventType.ERROR, log_message)

        # 에러 카운터 체크
        if self.error_count >= self.max_errors:
            warning_msg = f"에러가 {self.max_errors}개 이상 발생했습니다. 모니터링 상태를 확인하세요."
            self.logger.log_event(EventType.WARNING, warning_msg)
            # 에러 카운터 리셋
            self.error_count = 0

    def _log_debug(self, message: str) -> None:
        """디버그 로그 출력 (Phase 2)

        Args:
            message: 디버그 메시지
        """
        if self.debug_mode:
            self.logger.log_event(EventType.INFO, f"[DEBUG] {message}")

    def get_error_stats(self) -> Dict[str, any]:
        """에러 통계 반환 (Phase 2)

        Returns:
            Dict: 에러 통계 정보
        """
        return {
            "error_count": self.error_count,
            "max_errors": self.max_errors,
            "debug_mode": self.debug_mode,
            "retry_count": self.retry_count
        }

    def reset_error_count(self) -> None:
        """에러 카운터 초기화 (Phase 2)"""
        self.error_count = 0
        self.retry_count = 0
        self._log_debug("에러 카운터 초기화됨")


if __name__ == "__main__":
    print("Excel 이벤트 리스너는 Windows 환경에서만 실행됩니다.")
    print(f"COM 사용 가능: {COM_AVAILABLE}")

    if COM_AVAILABLE:
        print("\n직접 실행하지 말고 main_gui.py를 통해 실행하세요.")
