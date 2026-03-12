"""
누룽지 생산량 카운팅 시스템 - 캘리브레이션 도구
파라미터 조정을 위한 GUI 도구
"""

import tkinter as tk
from tkinter import ttk, filedialog
import cv2
import numpy as np
from PIL import Image, ImageTk


class CalibrationTool:
    """
    캘리브레이션 GUI 도구
    """

    def __init__(self, root):
        """
        초기화

        Args:
            root (tk.Tk): Tkinter 루트
        """
        self.root = root
        self.root.title("누룽지 카운팅 캘리브레이션 도구")
        self.root.geometry("1000x700")

        # 현재 이미지
        self.current_image = None
        self.current_image_rgb = None

        # 파라미터
        self.binary_threshold = tk.IntVar(value=127)
        self.min_area = tk.IntVar(value=500)
        self.max_area = tk.IntVar(value=10000)
        self.min_aspect_ratio = tk.DoubleVar(value=0.5)
        self.max_aspect_ratio = tk.DoubleVar(value=2.0)

        # UI 생성
        self._create_widgets()

    def _create_widgets(self):
        """
        UI 위젯 생성
        """
        # 상단: 파일 로드
        top_frame = ttk.Frame(self.root)
        top_frame.pack(fill=tk.X, padx=10, pady=5)

        ttk.Button(
            top_frame,
            text="📂 이미지 열기",
            command=self._load_image
        ).pack(side=tk.LEFT, padx=5)

        ttk.Button(
            top_frame,
            text="💾 파라미터 저장",
            command=self._save_parameters
        ).pack(side=tk.LEFT, padx=5)

        # 중앙: 이미지 표시 및 파라미터
        middle_frame = ttk.Frame(self.root)
        middle_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        # 좌측: 이미지
        image_frame = ttk.LabelFrame(middle_frame, text="이미지", padding=10)
        image_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.image_label = ttk.Label(image_frame, text="이미지를 불러오세요")
        self.image_label.pack()

        # 우측: 파라미터 조정
        param_frame = ttk.LabelFrame(middle_frame, text="파라미터 조정", padding=10, width=300)
        param_frame.pack(side=tk.RIGHT, fill=tk.Y, padx=(10, 0))
        param_frame.pack_propagate(False)

        # 이진화 임계값
        ttk.Label(param_frame, text="이진화 임계값 (0-255):").pack(anchor=tk.W, pady=(0, 5))
        ttk.Scale(
            param_frame,
            from_=0, to=255,
            variable=self.binary_threshold,
            orient=tk.HORIZONTAL,
            command=lambda _: self._update_detection()
        ).pack(fill=tk.X, pady=(0, 10))
        ttk.Label(param_frame, textvariable=self.binary_threshold).pack(anchor=tk.W, pady=(0, 10))

        # 최소 면적
        ttk.Label(param_frame, text="최소 면적 (픽셀²):").pack(anchor=tk.W, pady=(0, 5))
        ttk.Scale(
            param_frame,
            from_=100, to=5000,
            variable=self.min_area,
            orient=tk.HORIZONTAL,
            command=lambda _: self._update_detection()
        ).pack(fill=tk.X, pady=(0, 10))
        ttk.Label(param_frame, textvariable=self.min_area).pack(anchor=tk.W, pady=(0, 10))

        # 최대 면적
        ttk.Label(param_frame, text="최대 면적 (픽셀²):").pack(anchor=tk.W, pady=(0, 5))
        ttk.Scale(
            param_frame,
            from_=1000, to=50000,
            variable=self.max_area,
            orient=tk.HORIZONTAL,
            command=lambda _: self._update_detection()
        ).pack(fill=tk.X, pady=(0, 10))
        ttk.Label(param_frame, textvariable=self.max_area).pack(anchor=tk.W, pady=(0, 10))

        # 최소 종횡비
        ttk.Label(param_frame, text="최소 종횡비:").pack(anchor=tk.W, pady=(0, 5))
        ttk.Scale(
            param_frame,
            from_=0.1, to=2.0,
            variable=self.min_aspect_ratio,
            orient=tk.HORIZONTAL,
            command=lambda _: self._update_detection()
        ).pack(fill=tk.X, pady=(0, 10))
        ttk.Label(param_frame, textvariable=self.min_aspect_ratio).pack(anchor=tk.W, pady=(0, 10))

        # 최대 종횡비
        ttk.Label(param_frame, text="최대 종횡비:").pack(anchor=tk.W, pady=(0, 5))
        ttk.Scale(
            param_frame,
            from_=0.5, to=5.0,
            variable=self.max_aspect_ratio,
            orient=tk.HORIZONTAL,
            command=lambda _: self._update_detection()
        ).pack(fill=tk.X, pady=(0, 10))
        ttk.Label(param_frame, textvariable=self.max_aspect_ratio).pack(anchor=tk.W, pady=(0, 10))

        # 하단: 결과
        bottom_frame = ttk.LabelFrame(self.root, text="감지 결과", padding=10)
        bottom_frame.pack(fill=tk.X, padx=10, pady=5)

        self.result_label = ttk.Label(
            bottom_frame,
            text="감지된 객체: 0개",
            font=("맑은 고딕", 12, "bold")
        )
        self.result_label.pack()

    def _load_image(self):
        """
        이미지 파일 로드
        """
        filepath = filedialog.askopenfilename(
            title="이미지 선택",
            filetypes=[("Image files", "*.jpg *.jpeg *.png"), ("All files", "*.*")]
        )

        if not filepath:
            return

        # 이미지 로드
        self.current_image = cv2.imread(filepath)
        self.current_image_rgb = cv2.cvtColor(self.current_image, cv2.COLOR_BGR2RGB)

        # 감지 수행
        self._update_detection()

    def _update_detection(self):
        """
        객체 감지 업데이트
        """
        if self.current_image is None:
            return

        # 파라미터
        threshold = self.binary_threshold.get()
        min_area = self.min_area.get()
        max_area = self.max_area.get()
        min_ratio = self.min_aspect_ratio.get()
        max_ratio = self.max_aspect_ratio.get()

        # 감지 수행
        count, boxes = self._detect_objects(
            self.current_image,
            threshold, min_area, max_area, min_ratio, max_ratio
        )

        # 시각화
        vis_image = self._visualize_detection(self.current_image_rgb.copy(), boxes)

        # 표시
        self._display_image(vis_image)

        # 결과 업데이트
        self.result_label.config(text=f"감지된 객체: {count}개")

    def _detect_objects(self, image, threshold, min_area, max_area, min_ratio, max_ratio):
        """
        객체 감지 (edge_device/detector.py와 동일한 로직)
        """
        # 그레이스케일 변환
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # 블러
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        # 이진화
        _, binary = cv2.threshold(blurred, threshold, 255, cv2.THRESH_BINARY)

        # 윤곽선 찾기
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # 필터링
        valid_objects = []
        for contour in contours:
            area = cv2.contourArea(contour)

            if area < min_area or area > max_area:
                continue

            x, y, w, h = cv2.boundingRect(contour)
            aspect_ratio = w / h if h > 0 else 0

            if aspect_ratio < min_ratio or aspect_ratio > max_ratio:
                continue

            valid_objects.append({
                "x": x, "y": y, "w": w, "h": h,
                "area": int(area),
                "aspect_ratio": round(aspect_ratio, 2)
            })

        return len(valid_objects), valid_objects

    def _visualize_detection(self, image, boxes):
        """
        감지 결과 시각화
        """
        for i, box in enumerate(boxes, 1):
            x, y, w, h = box["x"], box["y"], box["w"], box["h"]

            # 바운딩 박스
            cv2.rectangle(image, (x, y), (x + w, y + h), (0, 255, 0), 2)

            # 번호
            cv2.putText(image, str(i), (x, y - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        # 총 개수
        cv2.putText(image, f"Count: {len(boxes)}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

        return image

    def _display_image(self, image_rgb):
        """
        이미지 표시

        Args:
            image_rgb (numpy.ndarray): RGB 이미지
        """
        # 크기 조정 (640x480 최대)
        h, w = image_rgb.shape[:2]
        max_w, max_h = 640, 480

        if w > max_w or h > max_h:
            scale = min(max_w / w, max_h / h)
            new_w, new_h = int(w * scale), int(h * scale)
            image_rgb = cv2.resize(image_rgb, (new_w, new_h))

        # PIL 이미지로 변환
        pil_image = Image.fromarray(image_rgb)
        photo = ImageTk.PhotoImage(pil_image)

        # 표시
        self.image_label.config(image=photo, text="")
        self.image_label.image = photo  # 참조 유지

    def _save_parameters(self):
        """
        파라미터 저장
        """
        params = f"""
# edge_device/config.py에 추가할 파라미터

BINARY_THRESHOLD = {self.binary_threshold.get()}
MIN_AREA = {self.min_area.get()}
MAX_AREA = {self.max_area.get()}
MIN_ASPECT_RATIO = {self.min_aspect_ratio.get():.2f}
MAX_ASPECT_RATIO = {self.max_aspect_ratio.get():.2f}
        """

        filepath = filedialog.asksaveasfilename(
            title="파라미터 저장",
            defaultextension=".txt",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")]
        )

        if filepath:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(params)

            tk.messagebox.showinfo("저장 완료", f"파라미터가 저장되었습니다:\n{filepath}")


def main():
    """
    메인 함수
    """
    root = tk.Tk()
    app = CalibrationTool(root)
    root.mainloop()


if __name__ == "__main__":
    main()
