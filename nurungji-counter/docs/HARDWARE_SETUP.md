# 하드웨어 설치 가이드

누룽지 생산량 자동 카운팅 시스템의 하드웨어 설치 방법입니다.

## 필요한 부품

### 엣지 디바이스
| 품목 | 모델 | 수량 | 가격 | 구매처 |
|------|------|------|------|--------|
| 싱글보드 컴퓨터 | Raspberry Pi 4 (4GB) | 1 | 6만원 | 디바이스마트, 엘레파츠 |
| 카메라 모듈 | Pi Camera Module V2 | 1 | 3만원 | 디바이스마트 |
| 보조배터리 | 20,000mAh (5V/3A) | 1 | 3만원 | 다이소, 쿠팡 |
| MicroSD 카드 | 32GB Class 10 | 1 | 1만원 | 쿠팡, G마켓 |
| 케이스 | 방수/방진 케이스 | 1 | 1만원 | 알리익스프레스 |
| 마운트 | 천정 마운트 | 1 | 1만원 | DIY |
| **합계** | | | **약 15만원** | |

### PC 요구사항
- Windows 10/11, macOS, 또는 Linux
- Python 3.8 이상 설치 가능
- WiFi 연결 가능
- 특별한 GPU 불필요

## 라즈베리 파이 조립

### 1. 카메라 모듈 연결

1. **라즈베리 파이 전원 끄기**
2. **카메라 커넥터 찾기** (HDMI 포트 옆)
3. **커넥터 잠금 해제** (양쪽 클립 위로 당기기)
4. **카메라 리본 케이블 삽입**
   - 파란색 면이 HDMI 포트 쪽
   - 접점이 보드 쪽
5. **잠금** (클립 아래로 누르기)

### 2. 케이스 장착

1. 라즈베리 파이를 케이스에 넣기
2. 카메라 렌즈 구멍 확인
3. 환기 구멍 확보 (과열 방지)

### 3. 보조배터리 연결

1. USB-C 케이블로 라즈베리 파이와 배터리 연결
2. 5V/3A 출력 확인
3. 케이블 정리 (테이프 또는 타이로 고정)

## 천정 설치

### 1. 설치 위치 선정

#### 높이
- **권장**: 50~100cm
- 너무 낮으면: 팬이 화면을 가득 채워서 여러 팬 구분 어려움
- 너무 높으면: 해상도 부족, 감지 정확도 저하

#### 각도
- **권장**: 20~30도 기울임 (팬 바닥 촬영)
- 수직으로 하면 그림자 문제 발생 가능

#### 위치
- 팬 전체가 프레임에 들어오는 위치
- 조명이 일정한 곳 (창문 바로 옆 피하기)

### 2. 마운트 제작 (DIY)

#### 재료
- L자 브라켓 (2개)
- 나사 및 앵커
- 조절 가능한 암

#### 제작
1. 천정에 브라켓 고정 (나사 + 앵커)
2. 암을 브라켓에 연결
3. 라즈베리 파이 케이스를 암에 고정
4. 각도 조절

### 3. 배터리 배치

- 케이스 뒤쪽에 배터리 고정 (양면테이프 또는 벨크로)
- 또는 별도 선반에 배치하고 케이블로 연결

## 전원 관리

### 배터리 지속 시간

| 구성 | 소비 전력 | 20,000mAh 작동 시간 |
|------|----------|---------------------|
| 라즈베리 파이 4 + 카메라 | 2.5W (0.5A @ 5V) | 약 8시간 |
| 라즈베리 파이 Zero 2 W | 1W (0.2A @ 5V) | 약 20시간 |

### 전력 절약 팁

1. **촬영 간격 증가**
   ```python
   # config.py
   CAPTURE_INTERVAL = 2.0  # 1초 → 2초
   ```

2. **전력 절약 모드 활성화**
   ```python
   POWER_SAVE_MODE = True
   ```

3. **LED 비활성화**
   ```bash
   # /boot/config.txt에 추가
   dtparam=act_led_trigger=none
   dtparam=act_led_activelow=off
   ```

### 충전

- 작업 종료 후 USB-C로 충전 (약 3시간)
- 또는 여분 배터리 교체

## 네트워크 설정

### WiFi 연결 (라즈베리 파이)

#### 방법 1: raspi-config (화면 있는 경우)
```bash
sudo raspi-config
# System Options → Wireless LAN → SSID 입력 → 비밀번호 입력
```

#### 방법 2: wpa_supplicant.conf (헤드리스)

1. MicroSD 카드를 PC에 삽입
2. `/boot/wpa_supplicant.conf` 파일 생성:
   ```
   country=KR
   ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
   update_config=1

   network={
       ssid="WiFi_이름"
       psk="WiFi_비밀번호"
   }
   ```
3. MicroSD 카드를 라즈베리 파이에 삽입하고 부팅

### IP 주소 확인

#### 라즈베리 파이
```bash
hostname -I
# 출력: 192.168.1.50 (예시)
```

#### PC
```bash
# Windows
ipconfig

# Linux/macOS
ifconfig
```

### 고정 IP 설정 (선택사항)

라즈베리 파이에서:
```bash
sudo nano /etc/dhcpcd.conf
```

파일 끝에 추가:
```
interface wlan0
static ip_address=192.168.1.50/24
static routers=192.168.1.1
static domain_name_servers=8.8.8.8
```

재부팅:
```bash
sudo reboot
```

## 테스트

### 1. 카메라 테스트

```bash
cd edge_device
python3 test_camera.py
```

**테스트 항목**:
- ✅ 카메라 인식
- ✅ 프레임 캡처
- ✅ 이미지 저장

### 2. 네트워크 테스트

```bash
# 라즈베리 파이에서 PC로 ping
ping 192.168.1.100  # PC IP

# PC에서 라즈베리 파이로 ping
ping 192.168.1.50   # 라즈베리 파이 IP
```

### 3. 통합 테스트

1. PC에서 MQTT 브로커 실행
   ```bash
   mosquitto -v
   ```

2. 라즈베리 파이에서 메인 프로그램 실행
   ```bash
   python3 main.py
   ```

3. PC GUI 실행
   ```bash
   python main_gui.py
   ```

4. 연결 상태 확인: "🟢 라즈베리 파이 연결됨"

## 문제 해결

### 카메라 인식 안됨

**증상**: "카메라 초기화 실패" 오류

**해결**:
1. 리본 케이블 재연결
2. 카메라 활성화
   ```bash
   sudo raspi-config
   # Interface Options → Camera → Enable
   ```
3. 재부팅
   ```bash
   sudo reboot
   ```

### WiFi 연결 안됨

**증상**: IP 주소 없음

**해결**:
1. SSID와 비밀번호 확인
2. 2.4GHz WiFi 사용 (5GHz 지원 안될 수 있음)
3. 수동 설정
   ```bash
   sudo nmcli dev wifi connect "WiFi_이름" password "비밀번호"
   ```

### 배터리 인식 안됨

**증상**: 전원 공급 경고

**해결**:
1. 5V/3A 출력 확인
2. 케이블 상태 확인 (고품질 USB-C 케이블 사용)
3. 배터리 충전 상태 확인

## 유지보수

### 일일 점검
- [ ] 배터리 충전
- [ ] 카메라 렌즈 청소 (부드러운 천)
- [ ] 연결 상태 확인

### 주간 점검
- [ ] 마운트 고정 상태 확인
- [ ] SD 카드 용량 확인 (로그 정리)
- [ ] 파라미터 재캘리브레이션 (필요 시)

### 월간 점검
- [ ] 시스템 업데이트
   ```bash
   sudo apt update && sudo apt upgrade
   ```
- [ ] 백업 (SD 카드 이미지)

## 업그레이드 옵션

### 더 긴 배터리 수명
- 30,000mAh 배터리 → 12시간
- 태양광 패널 → 무한

### 더 높은 정확도
- 고해상도 카메라 (HQ Camera Module)
- AI 모델 (YOLOv8-Nano)

### 여러 팬 동시 감지
- 광각 카메라
- 멀티 팬 추적 알고리즘

---

설치 중 문제가 있으면 [GitHub Issues]에 문의하세요.
