// Firebase 데이터베이스 참조
const database = firebase.database();
const productsRef = database.ref('products');
const barcodesRef = database.ref('barcodes');
const historyRef = database.ref('history');
const dailyClosingsRef = database.ref('dailyClosings');
const emailSettingsRef = database.ref('emailSettings');

// HTML 이스케이프 (XSS 방지)
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================
// 스캔 피드백 (소리/진동)
// ============================================
const AudioFeedback = {
    context: null,
    enabled: true,

    init() {
        // 사용자 인터랙션 후 AudioContext 생성 (브라우저 정책)
        if (!this.context) {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
        }
    },

    // 성공 소리 (높은 비프음 2번)
    playSuccess() {
        if (!this.enabled) return;
        this.init();
        this.beep(880, 0.1);
        setTimeout(() => this.beep(1100, 0.1), 120);
        this.vibrate([50, 30, 50]);
    },

    // 실패 소리 (낮은 버저음)
    playError() {
        if (!this.enabled) return;
        this.init();
        this.beep(200, 0.3);
        this.vibrate([200, 100, 200]);
    },

    // 비프음 생성
    beep(frequency, duration) {
        if (!this.context) return;
        const oscillator = this.context.createOscillator();
        const gainNode = this.context.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.context.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.3;

        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);
        oscillator.stop(this.context.currentTime + duration);
    },

    // 진동 (모바일)
    vibrate(pattern) {
        if (navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    }
};

// undefined 항목 삭제 (일회성)
productsRef.child('undefined').remove().then(() => {
    console.log('undefined 항목 삭제 완료');
}).catch((error) => {
    console.log('undefined 항목 삭제 시도:', error.message);
});

// DOM 요소
const barcodeInput = document.getElementById('barcode-input');
const scanResult = document.getElementById('scan-result');
const scanIndicator = document.getElementById('scan-indicator');
const loadingOverlay = document.getElementById('loading-overlay');
const inventoryTbody = document.getElementById('inventory-tbody');
const productionHistoryThead = document.getElementById('production-history-thead');
const productionHistoryTbody = document.getElementById('production-history-tbody');
const historyTbody = document.getElementById('history-tbody');
const barcodeTbody = document.getElementById('barcode-tbody');
const connectionStatus = document.getElementById('connection-status');
const productForm = document.getElementById('product-form');

// 바코드 입력 필드 IME 비활성화 강제
barcodeInput.addEventListener('compositionstart', (e) => {
    e.preventDefault();
    console.log('한글 입력 모드 감지됨 - 차단');
});

// 바코드 입력 필드 포커스 시 영문 모드로 전환 시도
barcodeInput.addEventListener('focus', () => {
    // 한글 입력 모드 해제 시도
    barcodeInput.setAttribute('lang', 'en');
    barcodeInput.style.imeMode = 'disabled';
});

// 앱 상태 관리
const AppState = {
    productsData: {},
    barcodesData: {},
    historyData: [],
    dailyClosingsData: {},  // 마감 기록 데이터
    isEditingMinStock: false,
    isEditingCurrentStock: false,
    isEditingProduction: false,  // 생산현황 편집 중
    editingProduct: null,  // 수정 중인 제품명 (null이면 신규 등록 모드)
    currentWorkingProduct: null,  // 현재 작업 중인 제품 (강조 표시용)
    selectedProductIndex: 0,  // 키보드 단축키용 선택된 제품 인덱스
    isProductLocked: false,  // 제품 선택 고정 상태
    choolgoSummary: { channels: {}, products: {} },  // 오늘 출고 예정 요약 (choolgo-watcher)
    yesterdaySummary: { channels: {}, products: {} }, // 어제 출고(기출고) 요약
    productNameMappings: {},  // 품목명 매핑 (출하관리)
    chulhaProcessing: false,  // 출하 처리 중 플래그
    choolgoViewDate: null,  // 출고파일 현황 조회 날짜 (기본: 오늘, formatDateKey 정의 후 초기화)
    emailSettings: {  // 이메일 자동 처리 설정
        account: {},  // { email, password, host, port, pollInterval }
        senderRules: {}  // { ruleId: { pattern, channel, folder, description, priority } }
    },
    editingSenderRuleId: null  // 수정 중인 발신자 규칙 ID
};

// ============================================
// 유틸리티 함수
// ============================================

// 제품 목록을 정렬하여 캐시 (색상 할당용)
let sortedProductNames = [];

// 제품명으로 고유한 색상 인덱스 계산 (0~19)
function getProductColorIndex(productName) {
    if (!productName) return 0;

    // 제품 데이터에서 사용자 지정 색상 확인
    const product = AppState.productsData[productName];
    if (product && product.colorIndex !== undefined && product.colorIndex !== null) {
        return product.colorIndex;
    }

    // 정렬된 제품 목록에서 인덱스 찾기 (기본값)
    let index = sortedProductNames.indexOf(productName);

    // 목록에 없으면 추가하고 다시 정렬
    if (index === -1) {
        sortedProductNames.push(productName);
        sortedProductNames.sort();
        index = sortedProductNames.indexOf(productName);
    }

    // 20개 색상 순환
    return index % 20;
}

// 제품 목록 업데이트 시 정렬된 이름 목록 갱신
function updateSortedProductNames() {
    const products = filterValidProducts(AppState.productsData);
    sortedProductNames = products.map(p => p.name).sort();
}

// 기존 제품에 productIndex가 없거나 바코드 키가 productIndex와 불일치하면 수정
let migrationDone = false;
async function migrateProductIndices() {
    if (migrationDone) return;

    const products = filterValidProducts(AppState.productsData);
    const barcodes = filterValidBarcodes(AppState.barcodesData);

    // 바코드 데이터가 아직 로드되지 않았으면 대기
    if (Object.keys(AppState.barcodesData).length === 0) return;

    // productIndex가 없는 제품이 있는지 확인
    let needsIndexMigration = false;
    for (const product of products) {
        if (!product.productIndex) {
            needsIndexMigration = true;
            break;
        }
    }

    // 바코드 키가 productIndex와 불일치하는 제품이 있는지 확인
    let needsBarcodeFix = false;
    if (!needsIndexMigration) {
        for (const product of products) {
            if (!product.productIndex) continue;
            const expectedPrefix = `P${product.productIndex}-`;
            const productBarcodes = barcodes.filter(b => b.productName === product.name);
            for (const bc of productBarcodes) {
                if (!bc.barcode.startsWith(expectedPrefix)) {
                    needsBarcodeFix = true;
                    break;
                }
            }
            if (needsBarcodeFix) break;
        }
    }

    if (!needsIndexMigration && !needsBarcodeFix) {
        migrationDone = true;
        return;
    }

    migrationDone = true;
    console.log('마이그레이션 시작...');

    // 1단계: 모든 제품에 고유 productIndex 부여
    const usedIndices = new Set();

    // 기존 productIndex가 있는 제품 먼저 등록
    for (const product of products) {
        if (product.productIndex) {
            usedIndices.add(product.productIndex);
        }
    }

    // productIndex가 없는 제품에 인덱스 부여
    for (const product of products) {
        if (product.productIndex) continue;

        // 바코드에서 인덱스 추출
        const barcode = barcodes.find(b => b.productName === product.name);
        let index = null;
        if (barcode && barcode.barcode.startsWith('P')) {
            index = barcode.barcode.substring(1, 4);
        }

        if (index && !usedIndices.has(index)) {
            usedIndices.add(index);
            await productsRef.child(product.name).update({ productIndex: index });
            product.productIndex = index;
            console.log(`마이그레이션: ${product.name} → 인덱스 ${index}`);
        } else {
            const newIndex = calcNextIndex(usedIndices, AppState.barcodesData);
            usedIndices.add(newIndex);
            await productsRef.child(product.name).update({ productIndex: newIndex });
            product.productIndex = newIndex;
            console.log(`마이그레이션: ${product.name} → 새 인덱스 ${newIndex} (충돌 방지)`);
        }
    }

    // 2단계: 바코드 키가 productIndex와 불일치하는 제품의 바코드 재생성
    for (const product of products) {
        if (!product.productIndex) continue;
        const expectedPrefix = `P${product.productIndex}-`;
        const productBarcodes = barcodes.filter(b => b.productName === product.name);
        const mismatchedBarcodes = productBarcodes.filter(b => !b.barcode.startsWith(expectedPrefix));

        if (mismatchedBarcodes.length === 0) continue;

        console.log(`바코드 수정: ${product.name} (인덱스 ${product.productIndex}) - ${mismatchedBarcodes.length}개 바코드 키 변경`);

        for (const bc of mismatchedBarcodes) {
            // 기존 바코드 삭제
            await barcodesRef.child(bc.barcode).remove();

            // 새 키로 바코드 재생성
            const newKey = bc.barcode.replace(/^P\d{3}/, `P${product.productIndex}`);
            await barcodesRef.child(newKey).set({
                barcode: newKey,
                productName: bc.productName,
                type: bc.type,
                quantity: bc.quantity,
                createdAt: bc.createdAt || Date.now()
            });
            console.log(`  ${bc.barcode} → ${newKey}`);
        }
    }

    console.log('마이그레이션 완료');
}

// usedIndices와 기존 바코드를 고려하여 다음 사용 가능한 인덱스 계산
function calcNextIndex(usedIndices, barcodesData) {
    let maxIdx = 0;
    for (const idx of usedIndices) {
        const num = parseInt(idx, 10);
        if (!isNaN(num) && num > maxIdx) maxIdx = num;
    }
    for (const key of Object.keys(barcodesData || {})) {
        if (key.startsWith('P')) {
            const num = parseInt(key.substring(1, 4), 10);
            if (!isNaN(num) && num > maxIdx) maxIdx = num;
        }
    }
    return (maxIdx + 1).toString().padStart(3, '0');
}

// 다음 사용 가능한 제품 인덱스 계산 (기존 인덱스와 충돌하지 않는 값)
function getNextProductIndex() {
    let maxIndex = 0;

    // 제품 레코드에 저장된 인덱스 확인
    const products = Object.values(AppState.productsData || {});
    for (const product of products) {
        if (product && product.productIndex) {
            const num = parseInt(product.productIndex, 10);
            if (!isNaN(num) && num > maxIndex) maxIndex = num;
        }
    }

    // 바코드 키에서 인덱스 추출하여 확인
    const barcodes = Object.keys(AppState.barcodesData || {});
    for (const key of barcodes) {
        if (key.startsWith('P')) {
            const num = parseInt(key.substring(1, 4), 10);
            if (!isNaN(num) && num > maxIndex) maxIndex = num;
        }
    }

    return (maxIndex + 1).toString().padStart(3, '0');
}

// 유효한 제품 데이터 필터링
function filterValidProducts(productsObj) {
    return Object.entries(productsObj)
        .filter(([key, value]) => key !== 'undefined' && value && value.name && value.name !== 'undefined')
        .map(([key, value]) => value);
}

// 유효한 바코드 데이터 필터링
function filterValidBarcodes(barcodesObj) {
    return Object.entries(barcodesObj)
        .filter(([key, value]) => key !== 'undefined' && value && value.barcode && value.productName && value.productName !== 'undefined')
        .map(([key, value]) => value);
}

// 유효한 히스토리 데이터 필터링
function filterValidHistory(historyArr) {
    return historyArr.filter(item => item && item.productName && item.productName !== 'undefined');
}

// 확인 다이얼로그 (Promise 기반)
function showConfirmDialog(message) {
    return new Promise((resolve) => {
        resolve(confirm(message));
    });
}

// 날짜 키 형식 변환 (YYYY-MM-DD)
function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
// choolgoViewDate 초기값 (formatDateKey 정의 후 설정)
AppState.choolgoViewDate = formatDateKey(new Date());

// 표시용 날짜 형식 (M월 D일)
function formatDisplayDate(date) {
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// 날짜 키에서 Date 객체 생성
function parseDateKey(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// ============================================
// 드래그앤드롭 정렬 기능
// ============================================

// SortableJS 인스턴스
let inventorySortableInstance = null;

// 재고 테이블 드래그앤드롭 초기화
function initInventoryDragAndDrop() {
    const tbody = document.getElementById('inventory-tbody');
    if (!tbody) return;

    // 기존 인스턴스가 있으면 제거
    if (inventorySortableInstance) {
        inventorySortableInstance.destroy();
        inventorySortableInstance = null;
    }

    // 데이터가 없으면 초기화하지 않음
    const rows = tbody.querySelectorAll('tr[data-product]');
    if (rows.length === 0) return;

    inventorySortableInstance = new Sortable(tbody, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',

        // 편집 중일 때 드래그 비활성화
        onStart: function(evt) {
            if (AppState.isEditingMinStock || AppState.isEditingCurrentStock) {
                return false;
            }
        },

        // 드래그 완료 시 Firebase 업데이트
        onEnd: async function(evt) {
            const rows = tbody.querySelectorAll('tr[data-product]');
            const updates = {};

            rows.forEach((row, index) => {
                const productName = row.getAttribute('data-product');
                if (productName) {
                    updates[`${productName}/sortOrder`] = index;
                    updates[`${productName}/updatedAt`] = Date.now();
                }
            });

            try {
                await productsRef.update(updates);
                showScanResult('순서가 저장되었습니다.', 'success');
            } catch (error) {
                console.error('순서 저장 오류:', error);
                showScanResult('순서 저장 중 오류가 발생했습니다.', 'error');
                // 롤백: 테이블 다시 렌더링
                updateInventoryTable();
            }
        }
    });
}

// ============================================

// 연결 상태 모니터링
const connectedRef = database.ref('.info/connected');
connectedRef.on('value', (snapshot) => {
    if (snapshot.val() === true) {
        connectionStatus.textContent = '연결됨';
        connectionStatus.className = 'status-badge connected';
    } else {
        connectionStatus.textContent = '연결 끊김';
        connectionStatus.className = 'status-badge disconnected';
    }
});

// 렌더링 debounce — 여러 리스너가 동시에 트리거될 때 1프레임으로 통합
let _inventoryDebounceTimer = null;
let _dashboardDebounceTimer = null;

// lucide 아이콘 렌더링 debounce — 같은 프레임 내 중복 호출 통합
let _lucideRafId = null;
function renderLucideIcons() {
    if (_lucideRafId) return; // 이미 예약됨
    _lucideRafId = requestAnimationFrame(() => {
        _lucideRafId = null;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
}

function scheduleInventoryUpdate() {
    if (_inventoryDebounceTimer) clearTimeout(_inventoryDebounceTimer);
    _inventoryDebounceTimer = setTimeout(() => {
        _inventoryDebounceTimer = null;
        updateInventoryTable();
    }, 30);
}

function scheduleDashboardUpdate() {
    if (_dashboardDebounceTimer) clearTimeout(_dashboardDebounceTimer);
    _dashboardDebounceTimer = setTimeout(() => {
        _dashboardDebounceTimer = null;
        updateDashboard();
    }, 30);
}

// 제품 목록 실시간 감지
productsRef.on('value', (snapshot) => {
    AppState.productsData = snapshot.val() || {};
    updateSortedProductNames();
    migrateProductIndices();
    scheduleInventoryUpdate();
    updateProductionHistoryTable();
    updateHistoryTable();
    updateBarcodeTable();
    scheduleDashboardUpdate();
});

// 바코드 목록 실시간 감지
barcodesRef.on('value', (snapshot) => {
    AppState.barcodesData = snapshot.val() || {};
    migrateProductIndices();
    updateBarcodeTable();
    scheduleInventoryUpdate();
    updateProductionHistoryTable();
});

// 히스토리 실시간 감지 (최근 50개만)
historyRef.orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
    AppState.historyData = [];
    snapshot.forEach((child) => {
        AppState.historyData.unshift(child.val()); // 최신순으로
    });
    updateHistoryTable();
    updateProductionHistoryTable();
    scheduleDashboardUpdate();
});

// 마감 기록 실시간 감지 (최근 7일)
dailyClosingsRef.orderByKey().limitToLast(7).on('value', (snapshot) => {
    AppState.dailyClosingsData = snapshot.val() || {};
    updateHistoryTable();
    updateProductionHistoryTable();
    scheduleDashboardUpdate();
});

// 오늘 출고 예정 요약 실시간 감지 (choolgo-watcher)
const choolgoTodayKey = formatDateKey(new Date());
const choolgoSummaryRef = database.ref(`choolgoLogs/${choolgoTodayKey}/summary`);
choolgoSummaryRef.on('value', (snapshot) => {
    AppState.choolgoSummary = snapshot.val() || { channels: {}, products: {} };
    scheduleInventoryUpdate();
    scheduleDashboardUpdate();
});

// 어제 기출고 요약 (어제 처리된 주문 = 오늘 기준 이미 나간 물량)
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const choolgoYesterdayKey = formatDateKey(yesterday);
const choolgoYesterdayRef = database.ref(`choolgoLogs/${choolgoYesterdayKey}/summary`);
choolgoYesterdayRef.on('value', (snapshot) => {
    AppState.yesterdaySummary = snapshot.val() || { channels: {}, products: {} };
    scheduleInventoryUpdate();
});

// 이메일 설정 실시간 감지
emailSettingsRef.on('value', (snapshot) => {
    const data = snapshot.val() || {};
    AppState.emailSettings.account = data.account || {};
    AppState.emailSettings.senderRules = data.senderRules || {};
    updateEmailAccountUI();
    updateSenderRulesTable();
});

// ============================================
// 대시보드 업데이트
// ============================================
function updateDashboard() {
    const products = filterValidProducts(AppState.productsData);
    const history = filterValidHistory(AppState.historyData);
    const closings = AppState.dailyClosingsData;

    // 오늘 날짜
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    // 금일 생산현황 테이블의 todayProduction 값을 사용 (카테고리별 합계)
    let catNurungji = 0, catSeoridae = 0, catPpungtwigi = 0;
    products.forEach(product => {
        const production = product.todayProduction || 0;
        if (product.name.includes('누룽지')) catNurungji += production;
        else if (product.name.includes('서리태')) catSeoridae += production;
        else if (product.name.includes('뻥튀기')) catPpungtwigi += production;
    });

    // 출고량 계산 (choolgo-watcher 요약 데이터 우선, 없으면 히스토리 기반)
    const choolgoProducts = AppState.choolgoSummary.products || {};
    let todayShipment = 0;
    if (Object.keys(choolgoProducts).length > 0) {
        todayShipment = Object.values(choolgoProducts).reduce((sum, qty) => sum + qty, 0);
    } else {
        const validProductNames = new Set(products.map(p => p.name));
        const todayHistory = history.filter(item =>
            item.timestamp >= todayTimestamp &&
            item.type !== 'ADJUST' &&
            validProductNames.has(item.productName)
        );

        const todayKey = formatDateKey(new Date());
        const todayClosing = closings[todayKey];
        const editedProducts = todayClosing?.products || {};

        const groupedShipment = {};
        todayHistory.forEach(item => {
            if (item.type === 'OUT') {
                const key = item.productName;
                if (!groupedShipment[key]) groupedShipment[key] = { totalQuantity: 0 };
                groupedShipment[key].totalQuantity += item.quantity;
            }
        });

        Object.entries(groupedShipment).forEach(([productName, data]) => {
            const editedData = editedProducts[productName];
            let displayQuantity = data.totalQuantity;
            if (editedData && editedData.editedAt && editedData.shipment !== undefined) {
                displayQuantity = editedData.shipment;
            }
            todayShipment += displayQuantity;
        });
    }

    // 총 재고 계산
    let totalStock = 0;
    let lowStockCount = 0;
    products.forEach(product => {
        totalStock += product.currentStock || 0;
        const minStock = product.minStock || 0;
        if (minStock > 0 && (product.currentStock || 0) < minStock) {
            lowStockCount++;
        }
    });

    // DOM 업데이트 - 종류별 생산 수량 (세로 배치)
    const productionEl = document.getElementById('stat-today-production');
    if (productionEl) {
        productionEl.innerHTML = `
            <div class="production-item"><span class="production-label" style="color: #eab308;">누룽지</span><span class="production-value">${catNurungji}</span></div>
            <div class="production-item"><span class="production-label" style="color: #f97316;">뻥튀기</span><span class="production-value">${catPpungtwigi}</span></div>
            <div class="production-item"><span class="production-label" style="color: #374151;">서리태</span><span class="production-value">${catSeoridae}</span></div>
        `;
    }
    document.getElementById('stat-today-shipment').textContent = todayShipment.toLocaleString();
    document.getElementById('stat-total-stock').textContent = totalStock.toLocaleString();
    document.getElementById('stat-low-stock').textContent = lowStockCount;

    // 7일 차트 업데이트
    updateWeeklyChart(closings);

    renderLucideIcons();
}

// 7일 생산 추이 차트 업데이트 (종류별 스택 차트)
function updateWeeklyChart(closings) {
    const chartContainer = document.getElementById('weekly-chart');
    if (!chartContainer) return;

    // 제품 카테고리 정의
    const categories = [
        { name: '누룽지', keyword: '누룽지', color: '#eab308' },
        { name: '뻥튀기', keyword: '뻥튀기', color: '#f97316' },
        { name: '서리태', keyword: '서리태', color: '#374151' }
    ];

    // 최근 7일 날짜 생성
    const dates = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        dates.push({
            key: formatDateKey(date),
            label: `${date.getMonth() + 1}/${date.getDate()}`
        });
    }

    // 오늘 날짜 키
    const todayKey = formatDateKey(new Date());

    // 각 날짜별 카테고리별 생산량 계산
    const dailyData = dates.map(d => {
        const categoryTotals = {};

        categories.forEach(cat => {
            categoryTotals[cat.keyword] = 0;
        });

        if (d.key === todayKey) {
            // 오늘은 실시간 데이터 사용
            const products = filterValidProducts(AppState.productsData);
            products.forEach(product => {
                const production = product.todayProduction || 0;
                categories.forEach(cat => {
                    if (product.name.includes(cat.keyword)) {
                        categoryTotals[cat.keyword] += production;
                    }
                });
            });
        } else {
            // 과거 날짜는 마감 데이터 사용
            const closing = closings[d.key];
            if (closing && closing.products) {
                Object.entries(closing.products).forEach(([productName, data]) => {
                    const production = data.production || 0;
                    categories.forEach(cat => {
                        if (productName.includes(cat.keyword)) {
                            categoryTotals[cat.keyword] += production;
                        }
                    });
                });
            }
        }

        const total = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);
        return { ...d, categoryTotals, total };
    });

    // 범례 동적 생성
    const legendEl = document.getElementById('chart-legend');
    if (legendEl) {
        legendEl.innerHTML = categories.map(cat =>
            `<span class="legend-item"><span class="legend-color" style="background:${cat.color};"></span>${escapeHtml(cat.name)}</span>`
        ).join('');
    }

    // 최대값 계산 (개별 카테고리 최대값 기준)
    let maxValue = 1;
    dailyData.forEach(d => {
        categories.forEach(cat => {
            const val = d.categoryTotals[cat.keyword];
            if (val > maxValue) maxValue = val;
        });
    });

    // 차트 HTML 생성 (그룹화된 막대그래프)
    chartContainer.innerHTML = dailyData.map(d => {
        const groupBars = categories.map(cat => {
            const value = d.categoryTotals[cat.keyword];
            const heightPct = (value / maxValue) * 100;
            return `<div class="bar-grouped" style="height: ${heightPct}%; background: ${cat.color};" title="${cat.name}: ${value}"></div>`;
        }).join('');

        return `
            <div class="bar-item">
                <span class="bar-value">${d.total > 0 ? d.total : ''}</span>
                <div class="bar-group">${groupBars}</div>
                <span class="bar-label">${d.label}</span>
            </div>
        `;
    }).join('');
}

// 제품 목록 정렬 (sortOrder 우선, 없으면 재고 부족 순)
function getSortedProducts(products) {
    return [...products].sort((a, b) => {
        const orderA = a.sortOrder;
        const orderB = b.sortOrder;
        if (orderA != null && orderB != null) return orderA - orderB;
        if (orderA != null) return -1;
        if (orderB != null) return 1;
        const minA = a.minStock || 0;
        const minB = b.minStock || 0;
        if (minA === 0 && minB !== 0) return 1;
        if (minA !== 0 && minB === 0) return -1;
        if (minA === 0 && minB === 0) return 0;
        return (minB - (b.currentStock || 0)) - (minA - (a.currentStock || 0));
    });
}

// 재고 테이블 업데이트
function updateInventoryTable() {
    const products = filterValidProducts(AppState.productsData);

    if (products.length === 0) {
        inventoryTbody.innerHTML = '<tr><td colspan="9" class="no-data">제품이 없습니다.</td></tr>';
        return;
    }

    const sortedProducts = getSortedProducts(products);

    inventoryTbody.innerHTML = sortedProducts.map((product, index) => {
        const minStock = product.minStock || 0; // undefined 방지
        const shortage = minStock - product.currentStock; // 부족한 수량

        let stockStatus, stockText;
        if (shortage > 0) {
            stockStatus = 'stock-low';
            stockText = `${shortage} 부족`;
        } else {
            stockStatus = 'stock-ok';
            stockText = `${-shortage} 여유`;
        }


        // 제품명 기반 고유 색상 클래스 (1~20)
        const colorIndex = getProductColorIndex(product.name) + 1;
        const colorClass = `product-color-${colorIndex}`;

        // 출고 예정량 (오늘 주문)
        const choolgoProducts = AppState.choolgoSummary.products || {};
        const shipmentQty = choolgoProducts[product.name] || 0;
        const shipmentDisplay = shipmentQty > 0
            ? `<button class="choolgo-shipment-value" onclick="showChannelDetail(event)" title="클릭하여 채널별 상세" aria-label="${shipmentQty}개 - 채널별 상세 보기">${shipmentQty}</button>`
            : '<span class="choolgo-shipment-zero">-</span>';

        // 기출고 (어제 주문 = 이미 나간 물량)
        const yesterdayProducts = AppState.yesterdaySummary.products || {};
        const yesterdayQty = yesterdayProducts[product.name] || 0;
        const yesterdayDisplay = yesterdayQty > 0
            ? `<span class="yesterday-shipment-value">${yesterdayQty}</span>`
            : '<span class="choolgo-shipment-zero">-</span>';

        // 출고 부족 판단: 출고 예정량 > 현재 재고
        const shipmentShortage = shipmentQty - product.currentStock;
        const hasShipmentShortage = shipmentShortage > 0;
        const rowExtraClass = hasShipmentShortage ? ' row-shipment-shortage' : '';

        const todayProduction = product.todayProduction || 0;
        const escapedName = escapeHtml(product.name);
        return `
            <tr class="${colorClass}${rowExtraClass}" data-product="${escapedName}">
                <td class="drag-handle" title="드래그하여 순서 변경">
                    <i data-lucide="grip-vertical" style="width: 18px; height: 18px; opacity: 0.5;"></i>
                </td>
                <td><strong>${escapedName}</strong></td>
                <td class="stock-number rice-cooker-count" data-product="${escapedName}"><strong>${product.riceCookerCount || 0}</strong></td>
                <td class="stock-number">${todayProduction}</td>
                <td class="stock-number editable-stock" data-product="${escapedName}" data-stock="${product.currentStock}" onclick="editCurrentStock(this)" title="클릭하여 수정"><strong>${product.currentStock}</strong> <i data-lucide="edit-2" style="width: 20px; height: 20px; display: inline-block; vertical-align: middle; opacity: 0.6;"></i></td>
                <td class="stock-number choolgo-shipment-cell">
                    ${shipmentDisplay}
                    ${hasShipmentShortage ? `<span class="shortage-badge">${shipmentShortage} 부족</span>` : ''}
                </td>
                <td class="stock-number yesterday-shipment-cell">${yesterdayDisplay}</td>
                <td class="stock-number editable-stock" data-product="${escapedName}" data-minstock="${minStock}" onclick="editMinStock(this)" title="클릭하여 수정"><span class="min-stock-value">${minStock}</span> <i data-lucide="edit-2" style="width: 20px; height: 20px; display: inline-block; vertical-align: middle; opacity: 0.6;"></i></td>
                <td>
                    <span class="stock-status ${stockStatus}">${stockText}</span>
                    <button onclick="changeProductColor(this.closest('tr').dataset.product)" class="btn-change-color" title="색상 변경" style="margin-left: 8px; padding: 4px 8px; border: none; background: rgba(0,0,0,0.1); border-radius: 4px; cursor: pointer; font-size: 0.85em;">
                        <i data-lucide="palette" style="width: 14px; height: 14px; vertical-align: middle;"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    renderLucideIcons();

    // 드래그앤드롭 정렬 초기화
    if (typeof Sortable !== 'undefined') {
        initInventoryDragAndDrop();
    }

    // 현재 작업 제품 강조 복원
    restoreWorkingProductHighlight();
}

// 채널별 출고 상세 툴팁 표시
function showChannelDetail(event) {
    event.stopPropagation();

    // 기존 툴팁 제거
    const existing = document.querySelector('.channel-tooltip');
    if (existing) existing.remove();

    const channels = AppState.choolgoSummary.channels || {};
    if (Object.keys(channels).length === 0) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'channel-tooltip';
    tooltip.innerHTML = '<div class="channel-tooltip-title">채널별 출고</div>' +
        Object.entries(channels)
            .sort((a, b) => b[1] - a[1])
            .map(([ch, qty]) => `<div class="channel-tooltip-row"><span>${ch}</span><span>${qty}봉</span></div>`)
            .join('');

    document.body.appendChild(tooltip);

    // 클릭한 요소 위치 기준으로 배치
    const rect = event.target.getBoundingClientRect();
    tooltip.style.top = `${rect.bottom + window.scrollY + 4}px`;
    tooltip.style.left = `${rect.left + window.scrollX}px`;

    // 화면 밖으로 나가면 조정
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth) {
        tooltip.style.left = `${window.innerWidth - tooltipRect.width - 8}px`;
    }

    // 다른 곳 클릭 시 닫기
    const closeHandler = () => {
        tooltip.remove();
        document.removeEventListener('click', closeHandler);
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

// 목표 재고 수정 함수
function editMinStock(element) {
    // 이미 편집 중인 경우 무시
    if (element.querySelector('input')) return;

    // data 속성에서 제품명과 현재값 가져오기
    const productName = element.getAttribute('data-product');
    const currentValue = parseInt(element.getAttribute('data-minstock')) || 0;


    AppState.isEditingMinStock = true; // 편집 시작
    const originalContent = element.innerHTML;

    // 인라인 편집 컨테이너 생성
    const container = document.createElement('div');
    container.className = 'inline-edit-container';

    // input 필드 생성
    const input = document.createElement('input');
    input.type = 'number';
    input.value = currentValue;
    input.min = '0';
    input.className = 'inline-edit-input';

    // 저장 버튼
    const saveBtn = document.createElement('button');
    saveBtn.className = 'inline-edit-btn inline-edit-btn-save';
    saveBtn.innerHTML = '&#10003;';
    saveBtn.title = '저장 (Enter)';

    // 취소 버튼
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'inline-edit-btn inline-edit-btn-cancel';
    cancelBtn.innerHTML = '&#10005;';
    cancelBtn.title = '취소 (ESC)';

    container.appendChild(input);
    container.appendChild(saveBtn);
    container.appendChild(cancelBtn);

    // 전체 내용 교체
    element.innerHTML = '';
    element.appendChild(container);

    // 포커스 및 전체 선택
    setTimeout(() => {
        input.focus();
        input.select();
    }, 0);

    // 저장 중 플래그
    let isSaving = false;

    // 취소 함수
    const cancelEdit = () => {
        if (isSaving) return;
        element.innerHTML = originalContent;
        AppState.isEditingMinStock = false;
        barcodeInput.focus();
    };

    // 저장 함수
    const saveValue = async () => {
        if (isSaving) return;
        isSaving = true;

        const newValue = input.value.trim();

        if (newValue === '') {
            isSaving = false;
            cancelEdit();
            return;
        }

        const minStock = parseInt(newValue);
        if (isNaN(minStock) || minStock < 0) {
            showScanResult('올바른 숫자를 입력해주세요.', 'error');
            isSaving = false;
            cancelEdit();
            return;
        }

        // 값이 변경되지 않았으면 그냥 취소
        if (minStock === currentValue) {
            isSaving = false;
            cancelEdit();
            return;
        }

        try {
            // Firebase에 업데이트
            await productsRef.child(productName).update({
                minStock: minStock,
                updatedAt: Date.now()
            });

            // 즉시 화면 업데이트 (Firebase 리스너 전에)
            element.innerHTML = `<span class="min-stock-value">${minStock}</span> <i data-lucide="edit-2" style="width: 20px; height: 20px; display: inline-block; vertical-align: middle; opacity: 0.6;"></i>`;

            renderLucideIcons();

            AppState.isEditingMinStock = false;
            showScanResult(`목표 재고가 ${minStock}개로 변경되었습니다.`, 'success');
            barcodeInput.focus();
        } catch (error) {
            console.error('목표 재고 업데이트 오류:', error);
            showScanResult('목표 재고 업데이트 중 오류가 발생했습니다.', 'error');
            element.innerHTML = originalContent;
            AppState.isEditingMinStock = false;
        }
        isSaving = false;
    };

    // 버튼 이벤트
    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveValue();
    });

    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelEdit();
    });

    // 엔터 키: 저장, ESC: 취소
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            saveValue();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelEdit();
        }
    });

    // 포커스 잃을 때: 저장 중이 아니면 취소 (버튼 클릭 허용을 위해 딜레이)
    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (AppState.isEditingMinStock && !isSaving && element.contains(container)) {
                cancelEdit();
            }
        }, 150);
    });
}

// 현재 재고 수정 함수
function editCurrentStock(element) {
    // 이미 편집 중인 경우 무시
    if (element.querySelector('input')) return;

    // data 속성에서 제품명과 현재값 가져오기
    const productName = element.getAttribute('data-product');
    const currentValue = parseInt(element.getAttribute('data-stock')) || 0;


    AppState.isEditingCurrentStock = true; // 편집 시작
    const originalContent = element.innerHTML;

    // 인라인 편집 컨테이너 생성
    const container = document.createElement('div');
    container.className = 'inline-edit-container';

    // input 필드 생성
    const input = document.createElement('input');
    input.type = 'number';
    input.value = currentValue;
    input.min = '0';
    input.className = 'inline-edit-input';

    // 저장 버튼
    const saveBtn = document.createElement('button');
    saveBtn.className = 'inline-edit-btn inline-edit-btn-save';
    saveBtn.innerHTML = '&#10003;';
    saveBtn.title = '저장 (Enter)';

    // 취소 버튼
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'inline-edit-btn inline-edit-btn-cancel';
    cancelBtn.innerHTML = '&#10005;';
    cancelBtn.title = '취소 (ESC)';

    container.appendChild(input);
    container.appendChild(saveBtn);
    container.appendChild(cancelBtn);

    // 전체 내용 교체
    element.innerHTML = '';
    element.appendChild(container);

    // 포커스 및 전체 선택
    setTimeout(() => {
        input.focus();
        input.select();
    }, 0);

    // 저장 중 플래그
    let isSaving = false;

    // 취소 함수
    const cancelEdit = () => {
        if (isSaving) return;
        element.innerHTML = originalContent;
        AppState.isEditingCurrentStock = false;
        barcodeInput.focus();
    };

    // 저장 함수
    const saveValue = async () => {
        if (isSaving) return;
        isSaving = true;

        const newValue = input.value.trim();

        if (newValue === '') {
            isSaving = false;
            cancelEdit();
            return;
        }

        const newStock = parseInt(newValue);
        if (isNaN(newStock) || newStock < 0) {
            showScanResult('올바른 숫자를 입력해주세요.', 'error');
            isSaving = false;
            cancelEdit();
            return;
        }

        // 값이 변경되지 않았으면 그냥 취소
        if (newStock === currentValue) {
            isSaving = false;
            cancelEdit();
            return;
        }

        try {
            // Firebase에 업데이트
            await productsRef.child(productName).update({
                currentStock: newStock,
                updatedAt: Date.now()
            });

            // 히스토리에 수동 조정 기록
            await historyRef.push({
                productName: productName,
                barcode: 'MANUAL',
                type: 'ADJUST',
                quantity: newStock - currentValue,
                beforeStock: currentValue,
                afterStock: newStock,
                timestamp: Date.now()
            });

            // 즉시 화면 업데이트 (Firebase 리스너 전에)
            element.innerHTML = `<strong>${newStock}</strong> <i data-lucide="edit-2" style="width: 20px; height: 20px; display: inline-block; vertical-align: middle; opacity: 0.6;"></i>`;

            renderLucideIcons();

            AppState.isEditingCurrentStock = false;
            showScanResult(`현재 재고가 ${currentValue}개에서 ${newStock}개로 수동 조정되었습니다.`, 'success');
            highlightProductRow(productName);
            barcodeInput.focus();
        } catch (error) {
            console.error('현재 재고 업데이트 오류:', error);
            showScanResult('현재 재고 업데이트 중 오류가 발생했습니다.', 'error');
            element.innerHTML = originalContent;
            AppState.isEditingCurrentStock = false;
        }
        isSaving = false;
    };

    // 버튼 이벤트
    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveValue();
    });

    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelEdit();
    });

    // 엔터 키: 저장, ESC: 취소
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            saveValue();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelEdit();
        }
    });

    // 포커스 잃을 때: 저장 중이 아니면 취소 (버튼 클릭 허용을 위해 딜레이)
    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (AppState.isEditingCurrentStock && !isSaving && element.contains(container)) {
                cancelEdit();
            }
        }, 150);
    });
}

// 히스토리 테이블 업데이트 (어제/오늘만 표시, 제품별로 합치기)
function updateHistoryTable() {
    if (!historyTbody) return;
    const validHistory = filterValidHistory(AppState.historyData);
    const validProducts = filterValidProducts(AppState.productsData);
    const validProductNames = new Set(validProducts.map(p => p.name));

    // 오늘 00:00:00 타임스탬프 계산
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    // 오늘 데이터만 필터링 (ADJUST 제외, 삭제된 제품 제외)
    const recentHistory = validHistory.filter(item => {
        return item.timestamp >= todayTimestamp &&
               item.type !== 'ADJUST' &&
               validProductNames.has(item.productName);
    });

    if (recentHistory.length === 0) {
        historyTbody.innerHTML = '<tr><td colspan="4" class="no-data">내역이 없습니다.</td></tr>';
        return;
    }

    // 제품별 + 타입별로 그룹화
    const groupedHistory = {};
    recentHistory.forEach(item => {
        const key = `${item.productName}-${item.type}`;
        if (!groupedHistory[key]) {
            groupedHistory[key] = {
                productName: item.productName,
                type: item.type,
                totalQuantity: 0,
                latestTimestamp: item.timestamp
            };
        }
        groupedHistory[key].totalQuantity += item.quantity;
        // 가장 최근 시간으로 업데이트
        if (item.timestamp > groupedHistory[key].latestTimestamp) {
            groupedHistory[key].latestTimestamp = item.timestamp;
        }
    });

    // 배열로 변환하고 시간 역순 정렬
    const groupedArray = Object.values(groupedHistory).sort((a, b) => b.latestTimestamp - a.latestTimestamp);

    // 오늘 날짜 키 (한 번만 계산)
    const todayKey = formatDateKey(new Date());

    // dailyClosings에서 수정된 값 확인
    const todayClosing = AppState.dailyClosingsData[todayKey];
    const editedProducts = todayClosing?.products || {};

    historyTbody.innerHTML = groupedArray.map(item => {
        // 시간 형식: 25.11.24 PM 10:41
        const date = new Date(item.latestTimestamp);
        const year = String(date.getFullYear()).slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        const formattedTime = `${year}.${month}.${day} ${ampm} ${displayHours}:${minutes}`;

        // 수정된 값이 있으면 사용, 없으면 원본 값
        const editedData = editedProducts[item.productName];
        let displayQuantity = item.totalQuantity;
        if (editedData && editedData.editedAt) {
            if (item.type === 'IN' && editedData.production !== undefined) {
                displayQuantity = editedData.production;
            } else if (item.type === 'OUT' && editedData.shipment !== undefined) {
                displayQuantity = editedData.shipment;
            }
        }

        // 생산/출고 컬럼 분리 (클릭하여 수정 가능)
        let productionCell, shipmentCell;
        if (item.type === 'IN') {
            productionCell = `<span class="transaction-type transaction-in editable-history" data-product="${item.productName}" data-type="production" data-date="${todayKey}" onclick="editTodayHistoryValue(this)">${displayQuantity}</span>`;
            shipmentCell = '-';
        } else if (item.type === 'OUT') {
            productionCell = '-';
            shipmentCell = `<span class="transaction-type transaction-out editable-history" data-product="${item.productName}" data-type="shipment" data-date="${todayKey}" onclick="editTodayHistoryValue(this)">${displayQuantity}</span>`;
        } else {
            productionCell = '-';
            shipmentCell = '-';
        }

        // 제품명 기반 고유 색상 클래스
        const colorIndex = getProductColorIndex(item.productName) + 1;
        const colorClass = `product-color-${colorIndex}`;

        return `
            <tr class="${colorClass}">
                <td>${formattedTime}</td>
                <td>${item.productName}</td>
                <td>${productionCell}</td>
                <td>${shipmentCell}</td>
            </tr>
        `;
    }).join('');

    renderLucideIcons();

    // 현재 작업 제품 강조 복원
    restoreWorkingProductHighlight();
}

// 생산 현황 테이블 업데이트 (7일치 마감 기록 기반)
function updateProductionHistoryTable() {
    const validProducts = filterValidProducts(AppState.productsData);
    const closings = AppState.dailyClosingsData;

    // 금일 생산현황과 동일한 순서로 정렬 (sortOrder 기반)
    const sortedProducts = getSortedProducts(validProducts);

    // 화면 크기에 따라 표시할 일수 결정 (모바일: 5일, PC: 7일)
    const daysToShow = window.innerWidth <= 768 ? 5 : 7;
    const dates = [];
    const today = new Date();
    for (let i = daysToShow - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        dates.push({
            dateKey: formatDateKey(date),
            displayDate: `${date.getMonth() + 1}/${date.getDate()}`,
            isToday: i === 0
        });
    }

    // 테이블 헤더 생성 (각 날짜에 밥솥/생산 서브헤더)
    let theadHtml = '<tr><th rowspan="2">제품명</th>';
    dates.forEach(d => {
        theadHtml += `<th colspan="2">${d.displayDate}${d.isToday ? '<br>(오늘)' : ''}</th>`;
    });
    theadHtml += '</tr><tr>';
    dates.forEach(() => {
        theadHtml += '<th class="sub-header">밥솥</th><th class="sub-header">생산</th>';
    });
    theadHtml += '</tr>';
    productionHistoryThead.innerHTML = theadHtml;

    // 제품이 없으면 빈 메시지 표시
    if (sortedProducts.length === 0) {
        productionHistoryTbody.innerHTML = `<tr><td colspan="${daysToShow * 2 + 1}" class="no-data">등록된 제품이 없습니다.</td></tr>`;
        return;
    }

    // 오늘 날짜 키
    const todayKey = formatDateKey(new Date());

    // 테이블 바디 생성
    let tbodyHtml = '';
    sortedProducts.forEach(product => {
        const productName = product.name;
        const colorIndex = getProductColorIndex(productName) + 1;
        const colorClass = `product-color-${colorIndex}`;

        const escapedProductName = escapeHtml(productName);
        tbodyHtml += `<tr class="${colorClass}"><td><strong>${escapedProductName}</strong></td>`;

        dates.forEach(d => {
            let riceCookerCount = 0;
            let production = 0;

            if (d.dateKey === todayKey) {
                // 오늘은 실시간 데이터 사용
                riceCookerCount = product.riceCookerCount || 0;
                production = product.todayProduction || 0;
            } else {
                // 과거 날짜는 마감 데이터 사용
                const closing = closings[d.dateKey];
                if (closing && closing.products && closing.products[productName]) {
                    riceCookerCount = closing.products[productName].riceCookerCount || 0;
                    production = closing.products[productName].production || 0;
                }
            }

            // 생산밥솥 셀
            if (riceCookerCount > 0) {
                tbodyHtml += `<td class="rice-cooker-cell"><span class="rice-cooker-badge">${riceCookerCount}</span></td>`;
            } else {
                tbodyHtml += `<td class="rice-cooker-cell no-data-cell">-</td>`;
            }

            // 금일생산 셀 (클릭하면 편집 가능)
            const cellClass = 'production-editable';
            const cellData = `data-date="${escapeHtml(d.dateKey)}" data-product="${escapedProductName}" onclick="editProductionValue(this)"`;

            if (production > 0) {
                tbodyHtml += `<td class="${cellClass}" ${cellData}><span class="transaction-type transaction-in">${production}</span></td>`;
            } else {
                tbodyHtml += `<td class="${cellClass} no-data-cell" ${cellData}>-</td>`;
            }
        });

        tbodyHtml += '</tr>';
    });

    productionHistoryTbody.innerHTML = tbodyHtml;

    renderLucideIcons();

    // 현재 작업 제품 강조 복원
    restoreWorkingProductHighlight();
}

// 바코드 관리 테이블 업데이트
function updateBarcodeTable() {
    const products = filterValidProducts(AppState.productsData);
    const barcodes = filterValidBarcodes(AppState.barcodesData);


    if (products.length === 0) {
        barcodeTbody.innerHTML = '<tr><td colspan="4" class="no-data">등록된 제품이 없습니다.</td></tr>';
        return;
    }

    // 바코드를 제품별로 그룹화
    const barcodesByProduct = {};
    barcodes.forEach(barcode => {
        if (!barcodesByProduct[barcode.productName]) {
            barcodesByProduct[barcode.productName] = {
                IN: [],
                OUT: [],
                VIEW: []
            };
        }
        barcodesByProduct[barcode.productName][barcode.type].push(barcode);
    });

    let html = '';
    products.forEach(product => {
        const productName = product.name;
        const productBarcodes = barcodesByProduct[productName] || { IN: [], OUT: [], VIEW: [] };

        // 생산 타입 수량 정리
        const inQuantities = productBarcodes.IN
            .sort((a, b) => b.quantity - a.quantity)
            .map(b => `${b.quantity}개`)
            .join(', ') || '-';

        // 출고 타입 수량 정리
        const outQuantities = productBarcodes.OUT
            .sort((a, b) => b.quantity - a.quantity)
            .map(b => `${b.quantity}개`)
            .join(', ') || '-';

        // 제품명 기반 고유 색상 클래스
        const colorIndex = getProductColorIndex(productName) + 1;
        const colorClass = `product-color-${colorIndex}`;

        const escapedPN = escapeHtml(productName);
        html += `
            <tr class="${colorClass}" data-product="${escapedPN}">
                <td class="product-name-cell"><strong>${escapedPN}</strong></td>
                <td>${inQuantities}</td>
                <td>${outQuantities}</td>
                <td>
                    <button class="btn-edit-barcode" data-product="${escapedPN}" onclick="editProduct(this.dataset.product)" title="제품 수정">
                        <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button class="btn-delete-barcode" data-product="${escapedPN}" onclick="deleteProduct(this.dataset.product)" title="제품 삭제">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    barcodeTbody.innerHTML = html;

    renderLucideIcons();

}

// 제품 수정 함수 (제품명 및 바코드 수량 변경)
async function editProduct(productName) {
    // 수정 모드로 전환
    AppState.editingProduct = productName;

    // 기존 바코드 정보 가져오기
    const barcodes = filterValidBarcodes(AppState.barcodesData);
    const relatedBarcodes = barcodes.filter(b => b.productName === productName);

    // 생산/출고 수량 추출
    const inQuantities = relatedBarcodes
        .filter(b => b.type === 'IN')
        .map(b => b.quantity)
        .sort((a, b) => b - a);

    const outQuantities = relatedBarcodes
        .filter(b => b.type === 'OUT')
        .map(b => b.quantity)
        .sort((a, b) => b - a);

    // 제품 등록 섹션 열기
    productRegisterSection.style.display = 'block';
    productRegisterSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // 제목 변경
    document.querySelector('#product-register-section h2').textContent = '제품 수정';

    // 제품명 입력
    document.getElementById('new-name').value = productName;

    // 생산 수량 입력 필드 생성
    const inContainer = document.getElementById('custom-quantities-in');
    inContainer.innerHTML = '';
    if (inQuantities.length > 0) {
        inQuantities.forEach((qty, idx) => {
            const div = document.createElement('div');
            div.style.cssText = 'display: flex; gap: 10px; margin-bottom: 5px;';
            div.innerHTML = `
                <input type="number" class="custom-quantity-input-in" min="1" value="${qty}">
                <button type="button" class="btn-${idx === 0 ? 'add' : 'remove'}-quantity" onclick="${idx === 0 ? 'addCustomQuantityInputIn()' : 'this.parentElement.remove()'}">${idx === 0 ? '+' : '-'}</button>
            `;
            inContainer.appendChild(div);
        });
    } else {
        inContainer.innerHTML = `
            <div style="display: flex; gap: 10px; margin-bottom: 5px;">
                <input type="number" class="custom-quantity-input-in" min="1" placeholder="예: 80">
                <button type="button" class="btn-add-quantity" onclick="addCustomQuantityInputIn()">+</button>
            </div>
        `;
    }

    // 출고 수량 입력 필드 생성
    const outContainer = document.getElementById('custom-quantities-out');
    outContainer.innerHTML = '';
    if (outQuantities.length > 0) {
        outQuantities.forEach((qty, idx) => {
            const div = document.createElement('div');
            div.style.cssText = 'display: flex; gap: 10px; margin-bottom: 5px;';
            div.innerHTML = `
                <input type="number" class="custom-quantity-input-out" min="1" value="${qty}">
                <button type="button" class="btn-${idx === 0 ? 'add' : 'remove'}-quantity" onclick="${idx === 0 ? 'addCustomQuantityInputOut()' : 'this.parentElement.remove()'}">${idx === 0 ? '+' : '-'}</button>
            `;
            outContainer.appendChild(div);
        });
    } else {
        outContainer.innerHTML = `
            <div style="display: flex; gap: 10px; margin-bottom: 5px;">
                <input type="number" class="custom-quantity-input-out" min="1" placeholder="예: 40">
                <button type="button" class="btn-add-quantity" onclick="addCustomQuantityInputOut()">+</button>
            </div>
        `;
    }

    // 제출 버튼 텍스트 변경
    document.querySelector('#product-form button[type="submit"]').textContent = '제품 수정';

    // 동적으로 생성된 입력 필드에 이벤트 리스너 추가 및 제품명 포커스
    setTimeout(() => {
        // 생산 수량 입력 필드들에 이벤트 리스너 추가
        const inInputs = document.querySelectorAll('#custom-quantities-in .custom-quantity-input-in');
        inInputs.forEach(input => {
            attachQuantityInputListeners(input, 'in');
        });

        // 출고 수량 입력 필드들에 이벤트 리스너 추가
        const outInputs = document.querySelectorAll('#custom-quantities-out .custom-quantity-input-out');
        outInputs.forEach(input => {
            attachQuantityInputListeners(input, 'out');
        });

        // 제품명 입력란으로 자동 포커스
        document.getElementById('new-name').focus();
    }, 100);
}

// 제품 색상 변경 함수
async function changeProductColor(productName) {
    const currentColorIndex = getProductColorIndex(productName);

    // 20가지 색상 정보
    const colors = [
        { name: '빨강', bg: '#FFB3BA' },
        { name: '주황', bg: '#FFCC99' },
        { name: '노랑', bg: '#FFFF99' },
        { name: '연두', bg: '#D4FF99' },
        { name: '초록', bg: '#99FFB3' },
        { name: '민트', bg: '#99FFE6' },
        { name: '하늘', bg: '#99F0FF' },
        { name: '파랑1', bg: '#B3E0FF' },
        { name: '파랑2', bg: '#99CCFF' },
        { name: '파랑3', bg: '#B3B3FF' },
        { name: '보라1', bg: '#D4B3FF' },
        { name: '분홍1', bg: '#FFB3E6' },
        { name: '분홍2', bg: '#FFB3D9' },
        { name: '분홍3', bg: '#FF99CC' },
        { name: '보라2', bg: '#E6CCFF' },
        { name: '살구', bg: '#FFD1B3' },
        { name: '피치', bg: '#FFE0B3' },
        { name: '라임', bg: '#E0FF99' },
        { name: '틸', bg: '#99FFFF' },
        { name: '인디고', bg: '#C2B3FF' }
    ];

    // 색상 선택 HTML 생성
    let html = `
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; padding: 20px;">
    `;

    colors.forEach((color, index) => {
        const selected = index === currentColorIndex ? 'border: 3px solid #000;' : '';
        html += `
            <div onclick="selectColor(${index})" style="cursor: pointer; padding: 15px; background: ${color.bg}; border-radius: 8px; text-align: center; font-weight: 600; ${selected}" title="${color.name}">
                ${color.name}
            </div>
        `;
    });

    html += `</div>`;

    // 색상 선택 함수를 전역으로 등록
    window.selectColor = async (colorIndex) => {
        try {
            await productsRef.child(productName).update({
                colorIndex: colorIndex,
                updatedAt: Date.now()
            });

            showScanResult(`"${productName}" 색상이 변경되었습니다.`, 'success');

            // 다이얼로그와 오버레이 닫기
            const overlay = document.querySelector('.color-picker-overlay');
            const dialog = document.querySelector('.color-picker-dialog');
            if (overlay) overlay.remove();
            if (dialog) dialog.remove();
        } catch (error) {
            console.error('색상 변경 오류:', error);
            showScanResult('색상 변경 중 오류가 발생했습니다.', 'error');
        }
    };

    // 다이얼로그 생성
    const dialog = document.createElement('div');
    dialog.className = 'color-picker-dialog';
    dialog.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 10000; max-width: 600px;';
    dialog.innerHTML = `
        <div style="padding: 20px; border-bottom: 1px solid #e0e0e0;">
            <h3 style="margin: 0;">${productName} - 색상 선택</h3>
        </div>
        ${html}
        <div style="padding: 15px; text-align: right; border-top: 1px solid #e0e0e0;">
            <button onclick="document.querySelector('.color-picker-overlay').remove(); this.closest('.color-picker-dialog').remove();" style="padding: 8px 16px; background: #e0e0e0; border: none; border-radius: 6px; cursor: pointer; font-size: 1em;">취소</button>
        </div>
    `;

    // 오버레이 생성
    const overlay = document.createElement('div');
    overlay.className = 'color-picker-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999;';
    overlay.onclick = () => {
        overlay.remove();
        dialog.remove();
    };

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);
}

// 제품 삭제 함수
async function deleteProduct(productName) {
    // 관련 바코드 확인
    const barcodes = filterValidBarcodes(AppState.barcodesData);
    const relatedBarcodes = barcodes.filter(b => b.productName === productName);

    let message = `제품 "${productName}"을(를) 삭제하시겠습니까?`;
    if (relatedBarcodes.length > 0) {
        message += `\n\n관련된 바코드 ${relatedBarcodes.length}개도 함께 삭제됩니다.`;
    }

    const confirmed = await showConfirmDialog(message);
    if (!confirmed) return;

    try {
        // 1. 제품 삭제
        await productsRef.child(productName).remove();

        // 2. 관련 바코드 삭제
        for (const barcode of relatedBarcodes) {
            await barcodesRef.child(barcode.barcode).remove();
        }

        showScanResult(`제품 "${productName}"이(가) 삭제되었습니다.`, 'success');
    } catch (error) {
        console.error('제품 삭제 오류:', error);
        showScanResult('제품 삭제 중 오류가 발생했습니다.', 'error');
    }
}

// 바코드 수정 함수 (수량 변경)
async function editBarcode(barcodeId) {
    const barcodeInfo = AppState.barcodesData[barcodeId];

    if (!barcodeInfo) {
        showScanResult('바코드를 찾을 수 없습니다.', 'error');
        return;
    }

    if (barcodeInfo.type === 'VIEW') {
        showScanResult('조회 바코드는 수량을 변경할 수 없습니다.', 'error');
        return;
    }

    const currentQuantity = barcodeInfo.quantity;
    const newQuantityStr = prompt(
        `바코드: ${barcodeId}\n제품: ${barcodeInfo.productName}\n타입: ${barcodeInfo.type === 'IN' ? '생산' : '출고'}\n\n새로운 수량을 입력하세요:`,
        currentQuantity
    );

    // 취소 또는 빈 입력
    if (newQuantityStr === null || newQuantityStr.trim() === '') {
        return;
    }

    const newQuantity = parseInt(newQuantityStr.trim());

    // 유효성 검사
    if (isNaN(newQuantity) || newQuantity <= 0) {
        showScanResult('올바른 수량을 입력해주세요. (1 이상의 숫자)', 'error');
        return;
    }

    // 값이 변경되지 않은 경우
    if (newQuantity === currentQuantity) {
        return;
    }

    const confirmed = await showConfirmDialog(
        `바코드 수량을 ${currentQuantity}개에서 ${newQuantity}개로 변경하시겠습니까?`
    );
    if (!confirmed) return;

    try {
        // Firebase에 업데이트
        await barcodesRef.child(barcodeId).update({
            quantity: newQuantity
        });

        showScanResult(`바코드 수량이 ${newQuantity}개로 변경되었습니다.`, 'success');
    } catch (error) {
        console.error('바코드 수정 오류:', error);
        showScanResult('바코드 수정 중 오류가 발생했습니다.', 'error');
    }
}

// 바코드 삭제 함수
async function deleteBarcode(barcodeId) {
    const confirmed = await showConfirmDialog(`바코드 "${barcodeId}"를 삭제하시겠습니까?`);
    if (!confirmed) return;

    try {
        await barcodesRef.child(barcodeId).remove();
        showScanResult('바코드가 삭제되었습니다.', 'success');
    } catch (error) {
        console.error('바코드 삭제 오류:', error);
        showScanResult('바코드 삭제 중 오류가 발생했습니다.', 'error');
    }
}

// 로딩 표시 함수
function showLoading(text = '처리 중...') {
    const loadingText = loadingOverlay.querySelector('.loading-text');
    if (loadingText) {
        loadingText.textContent = text;
    }
    loadingOverlay.classList.add('active');
}

function hideLoading() {
    loadingOverlay.classList.remove('active');
}

// 스캔 결과 표시
function showScanResult(message, type) {
    scanResult.textContent = message;
    scanResult.className = `scan-result ${type}`;
    scanResult.style.display = 'block';

    // 화면 전체 깜빡임 효과
    const flashOverlay = document.getElementById('scan-flash-overlay');
    if (flashOverlay) {
        flashOverlay.className = 'scan-flash-overlay';
        // reflow 강제 트리거 (애니메이션 재시작용)
        void flashOverlay.offsetWidth;
        flashOverlay.className = `scan-flash-overlay flash-${type}`;
    }

    // 소리/진동 피드백
    if (type === 'success') {
        AudioFeedback.playSuccess();
    } else if (type === 'error') {
        AudioFeedback.playError();
    }

    // 스캔 인디케이터 잠시 숨김
    scanIndicator.style.display = 'none';

    setTimeout(() => {
        scanResult.style.display = 'none';
        scanResult.textContent = '';
        scanResult.className = 'scan-result';

        // 스캔 인디케이터 다시 표시
        if (productRegisterSection.style.display === 'none' &&
            settingsSection.style.display === 'none') {
            scanIndicator.style.display = 'flex';
        }
    }, 5000);
}

// 현재 작업 중인 제품 강조 (지속적)
function highlightProductRow(productName) {
    // 기존 강조 모두 제거
    document.querySelectorAll('tr.row-highlight').forEach(row => {
        row.classList.remove('row-highlight');
    });

    // 해당 제품 행에 강조 추가
    const rows = document.querySelectorAll(`tr[data-product="${productName}"]`);
    rows.forEach(row => {
        row.classList.add('row-highlight');
    });

    // 현재 작업 제품 저장 (테이블 리렌더링 시 복원용)
    AppState.currentWorkingProduct = productName;
}

// 테이블 리렌더링 후 현재 작업 제품 강조 복원
function restoreWorkingProductHighlight() {
    if (AppState.currentWorkingProduct) {
        const rows = document.querySelectorAll(`tr[data-product="${AppState.currentWorkingProduct}"]`);
        rows.forEach(row => {
            row.classList.add('row-highlight');
            if (AppState.isProductLocked) {
                row.classList.add('row-locked');
            }
        });
    }
}

// 제품 찾기 (제품명으로)
function findProductByName(productName) {
    return AppState.productsData[productName];
}

// 바코드 찾기
function findBarcodeInfo(barcode) {
    return AppState.barcodesData[barcode];
}

// 재고 업데이트 함수
async function updateStock(barcodeInfo) {
    const { productName, type, quantity } = barcodeInfo;
    const product = findProductByName(productName);

    if (!product) {
        showScanResult('제품을 찾을 수 없습니다. 먼저 바코드를 등록하세요.', 'error');
        return;
    }

    // VIEW 타입 - 조회만
    if (type === 'VIEW') {
        showScanResult(`${productName} - 현재 재고: ${product.currentStock || 0}개`, 'success');
        highlightProductRow(productName);
        return;
    }

    try {
        let capturedBefore = 0;
        let capturedAfter = 0;

        // Firebase transaction으로 원자적 재고 업데이트 (동시 스캔 경쟁 조건 방지)
        const result = await productsRef.child(productName).transaction((current) => {
            if (current === null) return current;

            capturedBefore = current.currentStock || 0;

            if (type === 'IN') {
                capturedAfter = capturedBefore + quantity;
                return { ...current,
                    currentStock: capturedAfter,
                    todayProduction: (current.todayProduction || 0) + quantity,
                    updatedAt: Date.now() };
            } else {
                capturedAfter = capturedBefore - quantity;
                if (capturedAfter < 0) return; // abort — 재고 부족
                return { ...current, currentStock: capturedAfter, updatedAt: Date.now() };
            }
        });

        if (!result.committed) {
            showScanResult('재고가 부족합니다!', 'error');
            return;
        }

        // 히스토리 추가
        await historyRef.push({
            productName: productName,
            barcode: barcodeInfo.barcode,
            type: type,
            quantity: quantity,
            beforeStock: capturedBefore,
            afterStock: capturedAfter,
            timestamp: Date.now()
        });

        const typeText = type === 'IN' ? '생산' : type === 'ADJUST' ? '수정' : '출고';
        showScanResult(`${productName} ${typeText} 완료! (${capturedBefore} → ${capturedAfter})`, 'success');

        // 해당 제품 행 강조
        highlightProductRow(productName);

    } catch (error) {
        console.error('재고 업데이트 오류:', error);
        showScanResult('재고 업데이트 중 오류가 발생했습니다.', 'error');
    }
}

// 바코드 입력 처리 (엔터키)
barcodeInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const barcode = barcodeInput.value.trim();
        barcodeInput.value = '';

        if (!barcode) return;

        // 바코드 정보 조회
        const barcodeInfo = findBarcodeInfo(barcode);

        if (!barcodeInfo) {
            showScanResult('등록되지 않은 바코드입니다. 먼저 바코드를 등록하세요.', 'error');
            return;
        }

        // 바코드 정보에 따라 처리
        await updateStock(barcodeInfo);
    }
});

// 설정 섹션 토글
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const settingsSection = document.getElementById('settings-section');

btnSettings.addEventListener('click', () => {
    if (settingsSection.style.display === 'none') {
        settingsSection.style.display = 'block';
        settingsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        scanIndicator.style.display = 'none';
        renderLucideIcons();
    } else {
        settingsSection.style.display = 'none';
        scanIndicator.style.display = 'flex';
    }
});

btnCloseSettings.addEventListener('click', () => {
    settingsSection.style.display = 'none';
    scanIndicator.style.display = 'flex';
    barcodeInput.focus();
});

// 제품 등록 섹션 토글
const btnToggleRegister = document.getElementById('btn-toggle-register');
const btnCloseRegister = document.getElementById('btn-close-register');
const productRegisterSection = document.getElementById('product-register-section');

btnToggleRegister.addEventListener('click', () => {
    if (productRegisterSection.style.display === 'none') {
        // 신규 등록 모드로 초기화
        AppState.editingProduct = null;
        document.querySelector('#product-register-section h2').textContent = '제품 등록';
        document.querySelector('#product-form button[type="submit"]').textContent = '제품 등록 및 바코드 생성';
        productForm.reset();

        // 생산 입력 필드 초기화
        document.getElementById('custom-quantities-in').innerHTML = `
            <div style="display: flex; gap: 10px; margin-bottom: 5px;">
                <input type="number" class="custom-quantity-input-in" min="1" placeholder="예: 80">
                <button type="button" class="btn-add-quantity" onclick="addCustomQuantityInputIn()">+</button>
            </div>
        `;

        // 출고 입력 필드 초기화
        document.getElementById('custom-quantities-out').innerHTML = `
            <div style="display: flex; gap: 10px; margin-bottom: 5px;">
                <input type="number" class="custom-quantity-input-out" min="1" placeholder="예: 40">
                <button type="button" class="btn-add-quantity" onclick="addCustomQuantityInputOut()">+</button>
            </div>
        `;

        productRegisterSection.style.display = 'block';
        productRegisterSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        scanIndicator.style.display = 'none';

        // 초기 입력 필드에 이벤트 리스너 추가
        setTimeout(() => {
            const inInput = document.querySelector('#custom-quantities-in .custom-quantity-input-in');
            const outInput = document.querySelector('#custom-quantities-out .custom-quantity-input-out');
            if (inInput) attachQuantityInputListeners(inInput, 'in');
            if (outInput) attachQuantityInputListeners(outInput, 'out');

            // 제품명 입력란으로 자동 포커스
            document.getElementById('new-name').focus();
        }, 100);
    } else {
        productRegisterSection.style.display = 'none';
        scanIndicator.style.display = 'flex';
    }
});

btnCloseRegister.addEventListener('click', () => {
    // 수정 모드 해제
    AppState.editingProduct = null;
    document.querySelector('#product-register-section h2').textContent = '제품 등록';
    document.querySelector('#product-form button[type="submit"]').textContent = '제품 등록 및 바코드 생성';

    productRegisterSection.style.display = 'none';
    scanIndicator.style.display = 'flex';
    barcodeInput.focus();
});

// 바코드 관리 섹션 토글
const btnToggleBarcodeMgmt = document.getElementById('btn-toggle-barcode-management');
const barcodeMgmtSection = document.getElementById('barcode-management-section');

btnToggleBarcodeMgmt.addEventListener('click', () => {
    if (barcodeMgmtSection.style.display === 'none') {
        barcodeMgmtSection.style.display = 'block';
        barcodeMgmtSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        scanIndicator.style.display = 'none';
        renderLucideIcons();
    } else {
        barcodeMgmtSection.style.display = 'none';
        scanIndicator.style.display = 'flex';
    }
});

// 데이터베이스 초기화 함수
async function resetDatabase() {
    // 첫 번째 확인
    const confirm1 = await showConfirmDialog(
        '⚠️ 경고: 모든 데이터를 삭제하시겠습니까?\n\n' +
        '다음 항목이 모두 삭제됩니다:\n' +
        '- 모든 제품 정보\n' +
        '- 모든 바코드 정보\n' +
        '- 모든 생산/출고 히스토리\n\n' +
        '이 작업은 되돌릴 수 없습니다!'
    );

    if (!confirm1) return;

    // 두 번째 확인 (타이핑 확인)
    const userInput = prompt(
        '정말로 삭제하시겠습니까?\n\n' +
        '확인하려면 "삭제" 를 정확히 입력하세요:'
    );

    if (userInput !== '삭제') {
        if (userInput !== null) {
            showScanResult('데이터베이스 초기화가 취소되었습니다.', 'error');
        }
        return;
    }

    // 세 번째 최종 확인
    const confirm3 = await showConfirmDialog(
        '🚨 최종 확인: 정말로 모든 데이터를 삭제하시겠습니까?\n\n' +
        '이것은 마지막 확인입니다.\n' +
        '삭제 후에는 복구할 수 없습니다!'
    );

    if (!confirm3) {
        showScanResult('데이터베이스 초기화가 취소되었습니다.', 'error');
        return;
    }

    // 실제 삭제 진행
    try {
        showScanResult('데이터베이스 초기화 중...', 'success');

        // 모든 데이터 삭제
        await Promise.all([
            productsRef.remove(),
            barcodesRef.remove(),
            historyRef.remove()
        ]);

        showScanResult('데이터베이스가 성공적으로 초기화되었습니다.', 'success');

        // 설정 섹션 닫기
        settingsSection.style.display = 'none';
        barcodeInput.focus();

        console.log('데이터베이스 초기화 완료');
    } catch (error) {
        console.error('데이터베이스 초기화 오류:', error);
        showScanResult('데이터베이스 초기화 중 오류가 발생했습니다.', 'error');
    }
}

// 데이터베이스 초기화 버튼 이벤트
document.getElementById('btn-reset-database').addEventListener('click', resetDatabase);

// ============================================
// 수량 입력 필드 키보드 편의성 함수
// ============================================

// 입력 필드에 키보드 이벤트 리스너 추가
function attachQuantityInputListeners(input, type) {
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // 폼 제출 방지

            const container = document.getElementById(`custom-quantities-${type}`);
            const allInputs = Array.from(container.querySelectorAll(`input.custom-quantity-input-${type}`));
            const currentIndex = allInputs.indexOf(input);
            const isLast = currentIndex === allInputs.length - 1;

            if (isLast && input.value.trim() !== '') {
                // 마지막 필드이고 값이 있으면 새 필드 추가
                if (type === 'in') {
                    addCustomQuantityInputIn();
                } else {
                    addCustomQuantityInputOut();
                }
                // 새로 추가된 필드로 포커스 (setTimeout으로 DOM 업데이트 대기)
                setTimeout(() => {
                    const newInputs = container.querySelectorAll(`input.custom-quantity-input-${type}`);
                    if (newInputs.length > 0) {
                        newInputs[newInputs.length - 1].focus();
                    }
                }, 50);
            } else if (!isLast) {
                // 다음 필드로 포커스 이동
                allInputs[currentIndex + 1].focus();
            } else if (isLast && type === 'out' && input.value.trim() === '') {
                // 출고의 마지막 필드가 비어있으면 제출 버튼으로 포커스
                document.querySelector('#product-form button[type="submit"]').focus();
            }
        }
    });
}

// 생산 추가 수량 입력 필드 추가
function addCustomQuantityInputIn() {
    const container = document.getElementById('custom-quantities-in');
    const newInputDiv = document.createElement('div');
    newInputDiv.style.cssText = 'display: flex; gap: 10px; margin-bottom: 5px;';
    newInputDiv.innerHTML = `
        <input type="number" class="custom-quantity-input-in" min="1" placeholder="예: 20">
        <button type="button" class="btn-remove-quantity" onclick="this.parentElement.remove()">-</button>
    `;
    container.appendChild(newInputDiv);

    // 새로 추가된 입력 필드에 이벤트 리스너 추가
    const newInput = newInputDiv.querySelector('.custom-quantity-input-in');
    attachQuantityInputListeners(newInput, 'in');

    // 새 필드로 자동 포커스
    setTimeout(() => {
        newInput.focus();
    }, 50);
}

// 출고 추가 수량 입력 필드 추가
function addCustomQuantityInputOut() {
    const container = document.getElementById('custom-quantities-out');
    const newInputDiv = document.createElement('div');
    newInputDiv.style.cssText = 'display: flex; gap: 10px; margin-bottom: 5px;';
    newInputDiv.innerHTML = `
        <input type="number" class="custom-quantity-input-out" min="1" placeholder="예: 20">
        <button type="button" class="btn-remove-quantity" onclick="this.parentElement.remove()">-</button>
    `;
    container.appendChild(newInputDiv);

    // 새로 추가된 입력 필드에 이벤트 리스너 추가
    const newInput = newInputDiv.querySelector('.custom-quantity-input-out');
    attachQuantityInputListeners(newInput, 'out');

    // 새 필드로 자동 포커스
    setTimeout(() => {
        newInput.focus();
    }, 50);
}

// 제품 등록 및 바코드 자동 생성
productForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const productName = document.getElementById('new-name').value.trim();
    const isEditMode = AppState.editingProduct !== null;
    const oldProductName = AppState.editingProduct;

    if (!productName || productName === 'undefined') {
        alert('제품명은 필수입니다.');
        return;
    }

    // 로딩 표시
    showLoading(isEditMode ? '제품 수정 중...' : '제품 등록 중...');

    // 제품 중복 확인 (수정 모드가 아니거나, 제품명이 변경된 경우에만)
    if (!isEditMode || (isEditMode && productName !== oldProductName)) {
        if (findProductByName(productName)) {
            hideLoading();
            alert('이미 등록된 제품입니다.');
            return;
        }
    }

    // 생산 수량 단위 수집
    const quantitiesIn = [];
    document.querySelectorAll('.custom-quantity-input-in').forEach(input => {
        const val = parseInt(input.value);
        if (val > 0) {
            quantitiesIn.push(val);
        }
    });

    // 출고 수량 단위 수집
    const quantitiesOut = [];
    document.querySelectorAll('.custom-quantity-input-out').forEach(input => {
        const val = parseInt(input.value);
        if (val > 0) {
            quantitiesOut.push(val);
        }
    });

    if (quantitiesIn.length === 0 && quantitiesOut.length === 0) {
        hideLoading();
        alert('생산 또는 출고 수량 중 최소 1개 이상 입력해주세요.');
        return;
    }

    // 중복 제거 및 정렬
    const uniqueQuantitiesIn = [...new Set(quantitiesIn)].sort((a, b) => b - a);
    const uniqueQuantitiesOut = [...new Set(quantitiesOut)].sort((a, b) => b - a);

    try {
        // 제품 인덱스 계산 (제품 레코드에 저장하여 충돌 방지)
        let productIndex;
        const existingProduct = isEditMode ? AppState.productsData[oldProductName] : null;

        if (isEditMode && existingProduct && existingProduct.productIndex) {
            // 제품 레코드에 저장된 인덱스 사용
            productIndex = existingProduct.productIndex;
        } else if (isEditMode) {
            // 기존 제품에 인덱스가 없으면 바코드에서 추출 (마이그레이션)
            const oldBarcodes = filterValidBarcodes(AppState.barcodesData);
            const oldBarcode = oldBarcodes.find(b => b.productName === oldProductName || b.productName === productName);
            if (oldBarcode && oldBarcode.barcode.startsWith('P')) {
                productIndex = oldBarcode.barcode.substring(1, 4);
            } else {
                // 바코드도 없으면 새 인덱스 부여
                productIndex = getNextProductIndex();
            }
        } else {
            // 신규 등록: 새 인덱스 부여
            productIndex = getNextProductIndex();
        }

        // 다른 제품과 인덱스 충돌 확인 및 해결
        const allProducts = filterValidProducts(AppState.productsData);
        const conflictProduct = allProducts.find(p =>
            p.name !== oldProductName && p.name !== productName && p.productIndex === productIndex
        );
        if (conflictProduct) {
            console.warn(`인덱스 충돌 감지: ${productIndex} (${conflictProduct.name}). 새 인덱스 부여.`);
            productIndex = getNextProductIndex();
        }

        // 수정 모드인 경우 기존 바코드 삭제
        if (isEditMode) {
            const barcodes = filterValidBarcodes(AppState.barcodesData);
            const relatedBarcodes = barcodes.filter(b => b.productName === oldProductName);

            for (const barcode of relatedBarcodes) {
                await barcodesRef.child(barcode.barcode).remove();
            }

            // 제품명이 변경된 경우 기존 제품 삭제
            if (productName !== oldProductName) {
                await productsRef.child(oldProductName).remove();
            }
        }

        // 새로 생성할 바코드 키와 충돌하는 다른 제품의 고아 바코드 정리
        const indexPrefix = `P${productIndex}-`;
        const orphanBarcodes = filterValidBarcodes(AppState.barcodesData).filter(b =>
            b.barcode.startsWith(indexPrefix) &&
            b.productName !== productName &&
            b.productName !== oldProductName
        );
        if (orphanBarcodes.length > 0) {
            console.warn(`고아 바코드 ${orphanBarcodes.length}개 정리 (인덱스 ${productIndex}에 다른 제품 바코드 존재)`);
            for (const orphan of orphanBarcodes) {
                // 해당 제품의 올바른 인덱스로 바코드 재생성
                const orphanProduct = AppState.productsData[orphan.productName];
                if (orphanProduct && orphanProduct.productIndex && orphanProduct.productIndex !== productIndex) {
                    const newKey = orphan.barcode.replace(/^P\d{3}/, `P${orphanProduct.productIndex}`);
                    await barcodesRef.child(orphan.barcode).remove();
                    await barcodesRef.child(newKey).set({
                        barcode: newKey,
                        productName: orphan.productName,
                        type: orphan.type,
                        quantity: orphan.quantity,
                        createdAt: orphan.createdAt || Date.now()
                    });
                } else {
                    // 올바른 인덱스를 모르면 그냥 삭제 (해당 제품 수정 시 재생성됨)
                    await barcodesRef.child(orphan.barcode).remove();
                }
            }
        }

        // 제품 생성 또는 업데이트 (productIndex 포함)
        const productData = {
            name: productName,
            productIndex: productIndex,
            minStock: existingProduct ? existingProduct.minStock : 0,
            currentStock: existingProduct ? existingProduct.currentStock : 0,
            createdAt: existingProduct ? existingProduct.createdAt : Date.now(),
            updatedAt: Date.now()
        };
        // 기존 colorIndex 보존
        if (existingProduct && existingProduct.colorIndex !== undefined) {
            productData.colorIndex = existingProduct.colorIndex;
        }
        await productsRef.child(productName).set(productData);

        // 바코드 자동 생성
        let barcodeCount = 0;

        // 생산 바코드 생성
        for (const quantity of uniqueQuantitiesIn) {
            const barcodeIn = `P${productIndex}-IN-${quantity}`;
            await barcodesRef.child(barcodeIn).set({
                barcode: barcodeIn,
                productName: productName,
                type: 'IN',
                quantity: quantity,
                createdAt: Date.now()
            });
            barcodeCount++;
        }

        // 출고 바코드 생성
        for (const quantity of uniqueQuantitiesOut) {
            const barcodeOut = `P${productIndex}-OUT-${quantity}`;
            await barcodesRef.child(barcodeOut).set({
                barcode: barcodeOut,
                productName: productName,
                type: 'OUT',
                quantity: quantity,
                createdAt: Date.now()
            });
            barcodeCount++;
        }

        // 조회 바코드 생성 (기본)
        const barcodeView = `P${productIndex}-VIEW`;
        await barcodesRef.child(barcodeView).set({
            barcode: barcodeView,
            productName: productName,
            type: 'VIEW',
            quantity: 0,
            createdAt: Date.now()
        });
        barcodeCount++;


        // 로딩 숨김
        hideLoading();

        if (isEditMode) {
            showScanResult(`제품 "${productName}"이(가) 수정되었습니다! ${barcodeCount}개의 바코드가 생성되었습니다.`, 'success');
        } else {
            showScanResult(`제품 "${productName}"이(가) 등록되었습니다! ${barcodeCount}개의 바코드가 생성되었습니다.`, 'success');
        }

        // 수정 모드 해제
        AppState.editingProduct = null;

        // 제목 원래대로 복구
        document.querySelector('#product-register-section h2').textContent = '제품 등록';

        // 제출 버튼 텍스트 원래대로 복구
        document.querySelector('#product-form button[type="submit"]').textContent = '제품 등록 및 바코드 생성';

        // 폼 초기화
        productForm.reset();

        // 생산 입력 필드 초기화
        document.getElementById('custom-quantities-in').innerHTML = `
            <div style="display: flex; gap: 10px; margin-bottom: 5px;">
                <input type="number" class="custom-quantity-input-in" min="1" placeholder="예: 80">
                <button type="button" class="btn-add-quantity" onclick="addCustomQuantityInputIn()">+</button>
            </div>
        `;

        // 출고 입력 필드 초기화
        document.getElementById('custom-quantities-out').innerHTML = `
            <div style="display: flex; gap: 10px; margin-bottom: 5px;">
                <input type="number" class="custom-quantity-input-out" min="1" placeholder="예: 40">
                <button type="button" class="btn-add-quantity" onclick="addCustomQuantityInputOut()">+</button>
            </div>
        `;

        // 초기화된 입력 필드에 이벤트 리스너 추가 (섹션을 계속 열어둘 경우를 대비)
        setTimeout(() => {
            const inInput = document.querySelector('#custom-quantities-in .custom-quantity-input-in');
            const outInput = document.querySelector('#custom-quantities-out .custom-quantity-input-out');
            if (inInput) attachQuantityInputListeners(inInput, 'in');
            if (outInput) attachQuantityInputListeners(outInput, 'out');
        }, 50);

        // 등록 후 섹션 닫고 바코드 입력으로 포커스
        productRegisterSection.style.display = 'none';
        scanIndicator.style.display = 'flex';
        barcodeInput.focus();
    } catch (error) {
        console.error('제품 등록 오류:', error);
        hideLoading();
        showScanResult('제품 등록 중 오류가 발생했습니다.', 'error');
    }
});

// ============================================
// 바코드 인쇄 기능
// ============================================

// 바코드 인쇄 페이지 열기
function openBarcodePrintPage() {
    const products = filterValidProducts(AppState.productsData);
    const barcodes = filterValidBarcodes(AppState.barcodesData);

    if (products.length === 0) {
        alert('등록된 제품이 없습니다.');
        return;
    }

    if (barcodes.length === 0) {
        alert('등록된 바코드가 없습니다. 먼저 제품을 등록해주세요.');
        return;
    }

    // 제품별 바코드 그룹화
    const productBarcodes = {};
    barcodes.forEach(barcode => {
        if (!productBarcodes[barcode.productName]) {
            productBarcodes[barcode.productName] = { IN: [], OUT: [] };
        }
        if (barcode.type === 'IN') {
            productBarcodes[barcode.productName].IN.push(barcode);
        } else if (barcode.type === 'OUT') {
            productBarcodes[barcode.productName].OUT.push(barcode);
        }
    });

    // 제품별 색상 매핑 생성 (재고 현황과 동일한 색상 사용)
    const productColorMap = {};
    products.forEach(product => {
        const colorIndex = getProductColorIndex(product.name);
        productColorMap[product.name] = colorIndex % 20;
    });

    // 새 창 열기
    const printWindow = window.open('', '_blank', 'width=800,height=600');

    if (!printWindow) {
        alert('팝업이 차단되었습니다. 팝업을 허용해주세요.');
        return;
    }

    // HTML 생성
    let html = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>바코드 인쇄 - 우리곡간식품</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 20px;
            background: #f5f5f5;
        }
        .print-header {
            text-align: center;
            margin-bottom: 20px;
            padding: 20px;
            background: white;
            border-radius: 10px;
        }
        .print-header h1 {
            font-size: 1.8em;
            margin-bottom: 10px;
        }
        .print-header button {
            margin: 10px 5px;
            padding: 12px 30px;
            font-size: 1em;
            font-weight: 600;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            background: #667eea;
            color: white;
        }
        .print-header button:hover {
            background: #5568d3;
        }
        .page-section {
            background: white;
            padding: 30px;
            margin-bottom: 30px;
            border-radius: 10px;
            page-break-after: always;
        }
        .page-section h2 {
            text-align: center;
            margin-bottom: 30px;
            font-size: 1.5em;
            color: #333;
        }
        .product-row {
            margin-bottom: 20px;
            padding: 15px;
            border-radius: 8px;
            border: 2px solid #e0e0e0;
            page-break-inside: avoid;
        }
        .product-row-header {
            font-size: 1em;
            font-weight: 700;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid rgba(0,0,0,0.1);
            color: #333;
        }
        .barcode-list {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 30px;
            justify-items: stretch;
        }
        .barcode-item {
            border: 1px solid #ddd;
            padding: 10px;
            text-align: center;
            background: white;
            border-radius: 6px;
            width: 100%;
        }
        .barcode-title {
            font-size: 0.7em;
            font-weight: 600;
            margin-bottom: 4px;
            color: #333;
            word-break: keep-all;
        }
        .barcode-svg {
            margin: 2px auto;
            max-width: 100%;
            height: auto;
        }

        /* 제품별 색상 (선명한 20가지) */
        .product-row:nth-child(20n+1) { background: #FFB3BA; border-color: #FF6B7A; }
        .product-row:nth-child(20n+2) { background: #FFCC99; border-color: #FF9933; }
        .product-row:nth-child(20n+3) { background: #FFFF99; border-color: #FFFF00; }
        .product-row:nth-child(20n+4) { background: #D4FF99; border-color: #99FF33; }
        .product-row:nth-child(20n+5) { background: #99FFB3; border-color: #33FF66; }
        .product-row:nth-child(20n+6) { background: #99FFE6; border-color: #33FFCC; }
        .product-row:nth-child(20n+7) { background: #99F0FF; border-color: #33D6FF; }
        .product-row:nth-child(20n+8) { background: #B3E0FF; border-color: #66BBFF; }
        .product-row:nth-child(20n+9) { background: #99CCFF; border-color: #3399FF; }
        .product-row:nth-child(20n+10) { background: #B3B3FF; border-color: #6666FF; }
        .product-row:nth-child(20n+11) { background: #D4B3FF; border-color: #9966FF; }
        .product-row:nth-child(20n+12) { background: #FFB3E6; border-color: #FF66CC; }
        .product-row:nth-child(20n+13) { background: #FFB3D9; border-color: #FF66B3; }
        .product-row:nth-child(20n+14) { background: #FF99CC; border-color: #FF3399; }
        .product-row:nth-child(20n+15) { background: #E6CCFF; border-color: #CC99FF; }
        .product-row:nth-child(20n+16) { background: #FFD1B3; border-color: #FF9966; }
        .product-row:nth-child(20n+17) { background: #FFE0B3; border-color: #FFCC66; }
        .product-row:nth-child(20n+18) { background: #E0FF99; border-color: #CCFF33; }
        .product-row:nth-child(20n+19) { background: #99FFFF; border-color: #00FFFF; }
        .product-row:nth-child(20n+20) { background: #C2B3FF; border-color: #9966FF; }

        @media print {
            body {
                background: white;
                padding: 0;
            }
            .print-header {
                display: none;
            }
            .page-section {
                padding: 5mm;
                margin: 0;
                border-radius: 0;
            }
            .product-row {
                margin-bottom: 12px;
                padding: 10px;
                border-width: 2px;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            /* 인쇄 시에도 색상 유지 */
            .product-row:nth-child(20n+1) { background: #FFB3BA !important; border-color: #FF6B7A !important; }
            .product-row:nth-child(20n+2) { background: #FFCC99 !important; border-color: #FF9933 !important; }
            .product-row:nth-child(20n+3) { background: #FFFF99 !important; border-color: #FFFF00 !important; }
            .product-row:nth-child(20n+4) { background: #D4FF99 !important; border-color: #99FF33 !important; }
            .product-row:nth-child(20n+5) { background: #99FFB3 !important; border-color: #33FF66 !important; }
            .product-row:nth-child(20n+6) { background: #99FFE6 !important; border-color: #33FFCC !important; }
            .product-row:nth-child(20n+7) { background: #99F0FF !important; border-color: #33D6FF !important; }
            .product-row:nth-child(20n+8) { background: #B3E0FF !important; border-color: #66BBFF !important; }
            .product-row:nth-child(20n+9) { background: #99CCFF !important; border-color: #3399FF !important; }
            .product-row:nth-child(20n+10) { background: #B3B3FF !important; border-color: #6666FF !important; }
            .product-row:nth-child(20n+11) { background: #D4B3FF !important; border-color: #9966FF !important; }
            .product-row:nth-child(20n+12) { background: #FFB3E6 !important; border-color: #FF66CC !important; }
            .product-row:nth-child(20n+13) { background: #FFB3D9 !important; border-color: #FF66B3 !important; }
            .product-row:nth-child(20n+14) { background: #FF99CC !important; border-color: #FF3399 !important; }
            .product-row:nth-child(20n+15) { background: #E6CCFF !important; border-color: #CC99FF !important; }
            .product-row:nth-child(20n+16) { background: #FFD1B3 !important; border-color: #FF9966 !important; }
            .product-row:nth-child(20n+17) { background: #FFE0B3 !important; border-color: #FFCC66 !important; }
            .product-row:nth-child(20n+18) { background: #E0FF99 !important; border-color: #CCFF33 !important; }
            .product-row:nth-child(20n+19) { background: #99FFFF !important; border-color: #00FFFF !important; }
            .product-row:nth-child(20n+20) { background: #C2B3FF !important; border-color: #9966FF !important; }
            .product-row-header {
                font-size: 0.9em;
                margin-bottom: 8px;
                padding-bottom: 6px;
            }
            .barcode-list {
                grid-template-columns: repeat(3, 1fr);
                gap: 25px;
            }
            .barcode-item {
                border: 1px solid #999;
                padding: 8px;
                border-radius: 3px;
                width: 100%;
            }
            .barcode-title {
                font-size: 0.6em;
            }
            .barcode-svg {
                margin: 1px auto;
            }
        }

        @page {
            size: A4 landscape;
            margin: 10mm;
        }
    </style>
</head>
<body>
    <div class="print-header">
        <h1>📦 우리곡간식품 바코드 인쇄</h1>
        <p>생성된 바코드를 인쇄하거나 PDF로 저장하세요.</p>
        <button onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>
        <button onclick="window.close()">닫기</button>
    </div>
`;

    // 생산 바코드 페이지
    html += `
    <div class="page-section">
        <h2>생산 바코드 (IN)</h2>
`;

    products.forEach(product => {
        const inBarcodes = productBarcodes[product.name]?.IN || [];

        // 생산 바코드가 없으면 건너뛰기
        if (inBarcodes.length === 0) return;

        // 수량 내림차순 정렬
        inBarcodes.sort((a, b) => b.quantity - a.quantity);

        const escapedPrintNameIn = escapeHtml(product.name);
        html += `
        <div class="product-row" data-product="${escapedPrintNameIn}">
            <div class="product-row-header">${escapedPrintNameIn}</div>
            <div class="barcode-list">
`;

        inBarcodes.forEach(barcode => {
            html += `
                <div class="barcode-item">
                    <div class="barcode-title" style="color: #10b981;">생산 +${barcode.quantity}</div>
                    <svg class="barcode-svg" id="barcode-${barcode.barcode}"></svg>
                </div>
            `;
        });

        html += `
            </div>
        </div>
`;
    });

    html += `
    </div>
`;

    // 출고 바코드 페이지
    html += `
    <div class="page-section">
        <h2>출고 바코드 (OUT)</h2>
`;

    products.forEach(product => {
        const outBarcodes = productBarcodes[product.name]?.OUT || [];

        // 출고 바코드가 없으면 건너뛰기
        if (outBarcodes.length === 0) return;

        // 수량 내림차순 정렬
        outBarcodes.sort((a, b) => b.quantity - a.quantity);

        const escapedPrintNameOut = escapeHtml(product.name);
        html += `
        <div class="product-row" data-product="${escapedPrintNameOut}">
            <div class="product-row-header">${escapedPrintNameOut}</div>
            <div class="barcode-list">
`;

        outBarcodes.forEach(barcode => {
            html += `
                <div class="barcode-item">
                    <div class="barcode-title" style="color: #f59e0b;">출고 -${barcode.quantity}</div>
                    <svg class="barcode-svg" id="barcode-${barcode.barcode}"></svg>
                </div>
            `;
        });

        html += `
            </div>
        </div>
`;
    });

    html += `
    </div>
`;

    html += `
    <script>
        // 제품별 색상 매핑 (서버에서 생성)
        const productColorMap = ${JSON.stringify(productColorMap)};

        // 20가지 색상 팔레트
        const colors = [
            { bg: '#FFB3BA', border: '#FF6B7A' }, // 빨강
            { bg: '#FFCC99', border: '#FF9933' }, // 주황
            { bg: '#FFFF99', border: '#FFFF00' }, // 노랑
            { bg: '#D4FF99', border: '#99FF33' }, // 연두
            { bg: '#99FFB3', border: '#33FF66' }, // 초록
            { bg: '#99FFE6', border: '#33FFCC' }, // 민트
            { bg: '#99F0FF', border: '#33D6FF' }, // 청록
            { bg: '#B3E0FF', border: '#66BBFF' }, // 하늘
            { bg: '#99CCFF', border: '#3399FF' }, // 파랑
            { bg: '#B3B3FF', border: '#6666FF' }, // 남색
            { bg: '#D4B3FF', border: '#9966FF' }, // 보라
            { bg: '#FFB3E6', border: '#FF66CC' }, // 자주
            { bg: '#FFB3D9', border: '#FF66B3' }, // 분홍
            { bg: '#FF99CC', border: '#FF3399' }, // 핫핑크
            { bg: '#E6CCFF', border: '#CC99FF' }, // 라벤더
            { bg: '#FFD1B3', border: '#FF9966' }, // 코랄
            { bg: '#FFE0B3', border: '#FFCC66' }, // 피치
            { bg: '#E0FF99', border: '#CCFF33' }, // 라임
            { bg: '#99FFFF', border: '#00FFFF' }, // 틸
            { bg: '#C2B3FF', border: '#9966FF' }  // 인디고
        ];

        // 바코드 생성
        window.onload = function() {
            // 제품별 색상 적용
            document.querySelectorAll('.product-row').forEach(row => {
                const productName = row.getAttribute('data-product');
                if (productName && productColorMap[productName] !== undefined) {
                    const colorIndex = productColorMap[productName];
                    const color = colors[colorIndex];
                    row.style.background = color.bg;
                    row.style.borderColor = color.border;
                }
            });
`;

    // 모든 바코드 생성 스크립트
    barcodes.forEach(barcode => {
        html += `
            try {
                JsBarcode("#barcode-${barcode.barcode}", "${barcode.barcode}", {
                    format: "CODE128",
                    width: 1.0,
                    height: 35,
                    displayValue: true,
                    fontSize: 9,
                    margin: 2
                });
            } catch(e) {
                console.error("바코드 생성 오류:", e);
            }
        `;
    });

    html += `
        };
    </script>
</body>
</html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
}

// 바코드 인쇄 버튼 이벤트
document.getElementById('btn-print-barcode').addEventListener('click', () => {
    openBarcodePrintPage();
});

// 페이지 로드 시 바코드 입력에 포커스
window.addEventListener('load', () => {
    barcodeInput.focus();
});

// 포커스 항상 유지 (바코드 스캐너 입력 받기 위해)
// 단, 제품 등록 섹션/설정 섹션이 열려있거나 편집 중이거나 출하관리 페이지일 때는 제외
function shouldAutoFocusBarcode() {
    const shippingPage = document.getElementById('page-shipping');
    if (shippingPage && shippingPage.style.display !== 'none') return false;
    if (productRegisterSection.style.display !== 'none') return false;
    if (settingsSection.style.display !== 'none') return false;
    if (AppState.isEditingMinStock || AppState.isEditingCurrentStock || AppState.isEditingProduction) return false;
    return true;
}

barcodeInput.addEventListener('blur', () => {
    setTimeout(() => {
        if (shouldAutoFocusBarcode()) {
            barcodeInput.focus();
        }
    }, 100);
});

// 화면 클릭 시에도 포커스 유지
document.addEventListener('click', (e) => {
    if (shouldAutoFocusBarcode()) {
        barcodeInput.focus();
    }
});

// ============================================
// 금일 마감 기능
// ============================================

// 금일 마감 실행
// 마감 실행 (확인 대화상자 없이 - 자동마감/수동마감 공용)
async function executeClosing(dateKey) {
    const productSummary = {};
    // DOM 대신 AppState에서 직접 읽기 (인라인 편집 중이거나 렌더링 지연 시 DOM 값 불일치 방지)
    const products = filterValidProducts(AppState.productsData);
    const choolgoProducts = AppState.choolgoSummary.products || {};
    products.forEach(product => {
        productSummary[product.name] = {
            production: product.todayProduction || 0,
            shipment: choolgoProducts[product.name] || 0,
            riceCookerCount: product.riceCookerCount || 0
        };
    });

    if (Object.keys(productSummary).length === 0) return false;

    await dailyClosingsRef.child(dateKey).set({
        date: dateKey,
        closedAt: Date.now(),
        products: productSummary
    });

    // 생산밥솥 카운트 초기화
    const updates = {};
    Object.keys(productSummary).forEach(name => {
        updates[`${name}/riceCookerCount`] = 0;
    });
    await productsRef.update(updates);

    await cleanupOldClosings();
    return true;
}

async function closeTodayProduction() {
    const today = new Date();
    const dateKey = formatDateKey(today);

    // 이미 마감된 경우 확인
    if (AppState.dailyClosingsData[dateKey]) {
        const confirmed = await showConfirmDialog(
            `${formatDisplayDate(today)}은 이미 마감되었습니다.\n\n기존 마감을 덮어쓰시겠습니까?`
        );
        if (!confirmed) return;
    }

    try {
        // AppState에서 직접 읽기 (확인 대화상자용 요약)
        const products = filterValidProducts(AppState.productsData);

        // 마감할 내용이 없으면 종료
        if (products.length === 0) {
            showScanResult('등록된 제품이 없습니다.', 'error');
            return;
        }

        // 마감 확인
        const summaryText = products
            .map(p => `${p.name}: ${p.todayProduction || 0}개`)
            .join('\n');

        const confirmed = await showConfirmDialog(
            `${formatDisplayDate(today)} 마감을 진행하시겠습니까?\n\n[마감 내용]\n${summaryText}`
        );

        if (!confirmed) return;

        await executeClosing(dateKey);
        showScanResult(`${formatDisplayDate(today)} 마감이 완료되었습니다.`, 'success');
    } catch (error) {
        console.error('마감 저장 오류:', error);
        showScanResult('마감 저장 중 오류가 발생했습니다.', 'error');
    }
}

// 자정 자동 마감 + 리셋 통합 타이머 (마감 → 리셋 순서 보장)
function scheduleMidnightTasks() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    setTimeout(async () => {
        // 1. 전날 자동 마감
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const dateKey = formatDateKey(yesterday);
            if (!AppState.dailyClosingsData[dateKey]) {
                const result = await executeClosing(dateKey);
                if (result) showScanResult(`자동 마감 완료 (${dateKey})`, 'success');
            }
        } catch (error) {
            console.error('자동 마감 오류:', error);
        }

        // 2. 오늘 생산현황 리셋 (마감 완료 후 실행)
        await resetTodayProduction(true);

        // 다음 자정 타이머 재설정
        scheduleMidnightTasks();
    }, msUntilMidnight);
}

// 자정 타이머 시작
scheduleMidnightTasks();

// 7일 초과 마감 기록 자동 삭제
async function cleanupOldClosings() {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffKey = formatDateKey(sevenDaysAgo);

    const closings = AppState.dailyClosingsData;
    const keysToDelete = Object.keys(closings).filter(key => key < cutoffKey);

    for (const key of keysToDelete) {
        try {
            await dailyClosingsRef.child(key).remove();
        } catch (error) {
            console.error(`마감 기록 삭제 오류 (${key}):`, error);
        }
    }

    // history 노드도 함께 정리 (30일 초과 기록 삭제)
    await cleanupOldHistory();
}

async function cleanupOldHistory() {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const cutoffTimestamp = thirtyDaysAgo.getTime();

        const snapshot = await historyRef
            .orderByChild('timestamp')
            .endAt(cutoffTimestamp)
            .limitToFirst(500)
            .once('value');

        if (!snapshot.exists()) return;

        const updates = {};
        snapshot.forEach(child => { updates[child.key] = null; });
        await historyRef.update(updates);
    } catch (error) {
        console.error('history 정리 오류:', error);
    }
}

// 생산 현황 인라인 수정 (간단 버전)
async function editProductionValue(element) {
    if (element.querySelector('input')) return;

    AppState.isEditingProduction = true;

    const dateKey = element.getAttribute('data-date');
    const productName = element.getAttribute('data-product');

    const closing = AppState.dailyClosingsData[dateKey];
    let currentValue = 0;
    if (closing && closing.products && closing.products[productName]) {
        currentValue = closing.products[productName].production || 0;
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.value = currentValue;
    input.className = 'inline-edit-input';
    input.style.width = '60px';
    input.style.textAlign = 'center';

    element.innerHTML = '';
    element.appendChild(input);
    input.focus();
    input.select();

    let saved = false;

    const save = async () => {
        if (saved) return;
        saved = true;
        AppState.isEditingProduction = false;

        const newValue = parseInt(input.value) || 0;
        if (newValue < 0) {
            updateProductionHistoryTable();
            return;
        }

        try {
            const closingRef = dailyClosingsRef.child(dateKey);
            const snapshot = await closingRef.once('value');

            if (!snapshot.exists()) {
                await closingRef.set({
                    date: dateKey,
                    closedAt: Date.now(),
                    products: { [productName]: { production: newValue, shipment: 0, editedAt: Date.now() } }
                });
            } else {
                await closingRef.child('products').child(productName).update({ production: newValue, editedAt: Date.now() });
            }
            // Firebase 리스너가 자동으로 테이블 업데이트함
        } catch (error) {
            console.error('수정 오류:', error);
            updateProductionHistoryTable();
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { saved = true; AppState.isEditingProduction = false; updateProductionHistoryTable(); }
    });

    input.addEventListener('blur', () => save());
}

// 금일 생산현황 테이블에서 생산/출고 값 수정
async function editTodayHistoryValue(element) {
    if (element.querySelector('input')) return;

    AppState.isEditingProduction = true;

    const productName = element.getAttribute('data-product');
    const type = element.getAttribute('data-type'); // 'production' or 'shipment'
    const dateKey = element.getAttribute('data-date');
    const currentValue = parseInt(element.textContent) || 0;

    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.value = currentValue;
    input.className = 'inline-edit-input';
    input.style.width = '50px';
    input.style.textAlign = 'center';

    const originalHtml = element.innerHTML;
    element.innerHTML = '';
    element.appendChild(input);
    input.focus();
    input.select();

    let saved = false;

    const save = async () => {
        if (saved) return;
        saved = true;
        AppState.isEditingProduction = false;

        const newValue = parseInt(input.value) || 0;
        if (newValue < 0) {
            element.innerHTML = originalHtml;
            return;
        }

        try {
            const closingRef = dailyClosingsRef.child(dateKey);
            const snapshot = await closingRef.once('value');

            if (!snapshot.exists()) {
                // 새로 생성
                const productData = { editedAt: Date.now() };
                productData[type] = newValue;
                if (type === 'production') productData.shipment = 0;
                if (type === 'shipment') productData.production = 0;

                await closingRef.set({
                    date: dateKey,
                    closedAt: Date.now(),
                    products: { [productName]: productData }
                });
            } else {
                // 기존 데이터 업데이트
                const updateData = { editedAt: Date.now() };
                updateData[type] = newValue;
                await closingRef.child('products').child(productName).update(updateData);
            }

            // 테이블 UI 업데이트
            element.textContent = newValue;
            showScanResult(`${productName}의 ${type === 'production' ? '생산' : '출고'}량이 ${newValue}(으)로 수정되었습니다.`, 'success');
        } catch (error) {
            console.error('수정 오류:', error);
            element.innerHTML = originalHtml;
            showScanResult('수정 중 오류가 발생했습니다.', 'error');
        }
    };

    const cancel = () => {
        saved = true;
        AppState.isEditingProduction = false;
        element.innerHTML = originalHtml;
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { cancel(); }
    });

    input.addEventListener('blur', () => save());
}

// 마감 버튼 이벤트 리스너
document.getElementById('btn-close-today').addEventListener('click', closeTodayProduction);

// ============================================
// 금일 생산현황 리셋 기능
// ============================================

// 금일 생산현황 리셋 (모든 제품의 currentStock을 0으로)
async function resetTodayProduction(skipConfirm = false) {
    if (!skipConfirm) {
        const confirmed = confirm('금일 생산현황을 모두 0으로 리셋하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.');
        if (!confirmed) return;
    }

    const products = filterValidProducts(AppState.productsData);
    if (products.length === 0) {
        showScanResult('리셋할 제품이 없습니다.', 'info');
        return;
    }

    try {
        const updates = {};
        products.forEach(product => {
            updates[`${product.name}/todayProduction`] = 0;
            updates[`${product.name}/updatedAt`] = Date.now();
        });

        await productsRef.update(updates);
        showScanResult('금일 생산현황이 리셋되었습니다.', 'success');
    } catch (error) {
        console.error('리셋 오류:', error);
        showScanResult('리셋 중 오류가 발생했습니다.', 'error');
    }
}

// 리셋 버튼 이벤트 리스너
document.getElementById('btn-reset-today').addEventListener('click', () => resetTodayProduction(false));


// 화면 크기 변경 시 전일 생산현황 테이블 업데이트 (5일/7일 전환)
let resizeTimeout;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const currentWidth = window.innerWidth;
        // 768px 경계를 넘을 때만 업데이트
        if ((lastWidth <= 768 && currentWidth > 768) || (lastWidth > 768 && currentWidth <= 768)) {
            updateProductionHistoryTable();
        }
        lastWidth = currentWidth;
    }, 250);
});

// ============================================
// 키보드 단축키 수량 입력 시스템
// a~f: 생산(+), g~l: 생산 수정(-)
// 마우스 휠: 제품 선택
// ============================================

// 알파벳 키 수량 매핑
const FKEY_MAPPINGS = {
    'a': { quantity: 30, type: 'IN' },
    'b': { quantity: 25, type: 'IN' },
    'c': { quantity: 20, type: 'IN' },
    'd': { quantity: 10, type: 'IN' },
    'e': { quantity: 5,  type: 'IN' },
    'f': { quantity: 1,  type: 'IN' },
    'g': { quantity: 30, type: 'ADJUST' },
    'h': { quantity: 25, type: 'ADJUST' },
    'i': { quantity: 20, type: 'ADJUST' },
    'j': { quantity: 10, type: 'ADJUST' },
    'k': { quantity: 5,  type: 'ADJUST' },
    'l': { quantity: 1,  type: 'ADJUST' },
};

// 정렬된 제품 목록 가져오기 (재고 테이블과 동일한 순서)
function getSortedProductList() {
    const products = filterValidProducts(AppState.productsData);
    if (products.length === 0) return [];

    return products.sort((a, b) => {
        const orderA = a.sortOrder;
        const orderB = b.sortOrder;
        if (orderA !== undefined && orderA !== null &&
            orderB !== undefined && orderB !== null) {
            return orderA - orderB;
        }
        if (orderA !== undefined && orderA !== null) return -1;
        if (orderB !== undefined && orderB !== null) return 1;
        const minStockA = a.minStock || 0;
        const minStockB = b.minStock || 0;
        if (minStockA === 0 && minStockB !== 0) return 1;
        if (minStockA !== 0 && minStockB === 0) return -1;
        if (minStockA === 0 && minStockB === 0) return 0;
        const shortageA = minStockA - (a.currentStock || 0);
        const shortageB = minStockB - (b.currentStock || 0);
        return shortageB - shortageA;
    });
}

// 현재 선택된 제품 가져오기
function getSelectedProduct() {
    const products = getSortedProductList();
    if (products.length === 0) return null;
    // 인덱스 범위 보정
    if (AppState.selectedProductIndex >= products.length) {
        AppState.selectedProductIndex = products.length - 1;
    }
    if (AppState.selectedProductIndex < 0) {
        AppState.selectedProductIndex = 0;
    }
    return products[AppState.selectedProductIndex];
}

// 밥솥 카운터 증감 (메모리 + UI + Firebase 즉시 반영)
function updateRiceCookerCount(delta) {
    const product = getSelectedProduct();
    if (!product) return;
    const current = product.riceCookerCount || 0;
    const newCount = Math.max(0, current + delta);
    AppState.productsData[product.name].riceCookerCount = newCount;
    const cell = document.querySelector(`.rice-cooker-count[data-product="${product.name}"]`);
    if (cell) cell.innerHTML = `<strong>${newCount}</strong>`;
    productsRef.child(product.name).update({ riceCookerCount: newCount }).catch(err => {
        console.error('밥솥 카운터 저장 오류:', err.message);
        // 저장 실패 시 메모리 롤백
        AppState.productsData[product.name].riceCookerCount = current;
        if (cell) cell.innerHTML = `<strong>${current}</strong>`;
    });
}

// 선택된 제품 하이라이트 갱신
function updateSelectedProductHighlight() {
    const product = getSelectedProduct();
    // 고정 클래스 모두 제거
    document.querySelectorAll('tr.row-locked').forEach(row => {
        row.classList.remove('row-locked');
    });
    if (product) {
        highlightProductRow(product.name);
        // 고정 상태면 locked 클래스 추가
        if (AppState.isProductLocked) {
            const rows = document.querySelectorAll(`tr[data-product="${product.name}"]`);
            rows.forEach(row => row.classList.add('row-locked'));
        }
        // 선택된 행이 보이도록 스크롤
        const row = document.querySelector(`tr[data-product="${product.name}"]`);
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

// 제품 선택 고정/해제 토글
function toggleProductLock() {
    const product = getSelectedProduct();
    if (!product) return;

    AppState.isProductLocked = !AppState.isProductLocked;
    updateSelectedProductHighlight();

    if (AppState.isProductLocked) {
        showScanResult(`"${product.name}" 선택 고정됨 🔒`, 'success');
    } else {
        showScanResult(`선택 고정 해제됨 🔓`, 'success');
    }
}

// 편집 중인지 확인
function isEditing() {
    return AppState.isEditingMinStock ||
           AppState.isEditingCurrentStock ||
           AppState.isEditingProduction ||
           AppState.editingProduct !== null;
}

// 다이얼로그/모달이 열려있는지 확인
function isDialogOpen() {
    const productRegister = document.getElementById('product-register-section');
    const settings = document.getElementById('settings-section');
    const shippingPage = document.getElementById('page-shipping');
    return (productRegister && productRegister.style.display !== 'none') ||
           (settings && settings.style.display !== 'none') ||
           (shippingPage && shippingPage.style.display !== 'none');
}

// 제품 선택 이동 함수
function moveProductSelection(delta) {
    if (AppState.isProductLocked) return;  // 고정 중에는 이동 불가
    const products = getSortedProductList();
    if (products.length === 0) return;
    AppState.selectedProductIndex = Math.max(0, Math.min(
        AppState.selectedProductIndex + delta, products.length - 1
    ));
    updateSelectedProductHighlight();
}


// 키보드/노브로 제품 선택 ([], PageUp/Down, Home/End)
document.addEventListener('keydown', (e) => {
    if (isEditing() || isDialogOpen()) return;

    // 입력 필드에 포커스 중이면 무시 (바코드 입력 제외)
    const activeEl = document.activeElement;
    if (activeEl && activeEl.id !== 'barcode-input' && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) return;

    const products = getSortedProductList();
    switch (e.key) {
        case '[':
            e.preventDefault();
            moveProductSelection(-1);
            break;
        case ']':
            e.preventDefault();
            moveProductSelection(1);
            break;
        case 'PageUp':
            e.preventDefault();
            moveProductSelection(-5);
            break;
        case 'PageDown':
            e.preventDefault();
            moveProductSelection(5);
            break;
        case 'Home':
            e.preventDefault();
            if (!AppState.isProductLocked) {
                AppState.selectedProductIndex = 0;
                updateSelectedProductHighlight();
            }
            break;
        case 'End':
            e.preventDefault();
            if (!AppState.isProductLocked) {
                AppState.selectedProductIndex = products.length - 1;
                updateSelectedProductHighlight();
            }
            break;
        case 'w':
            e.preventDefault();
            toggleProductLock();
            break;
        case ',':
            e.preventDefault();
            if (AppState.isProductLocked) updateRiceCookerCount(-1);
            break;
        case '.':
            e.preventDefault();
            if (AppState.isProductLocked) updateRiceCookerCount(1);
            break;
        case ';':
            e.preventDefault();
            if (AppState.isProductLocked) {
                const prodForDec = getSelectedProduct();
                if (prodForDec) updateStock({ productName: prodForDec.name, barcode: 'KEY-ADJUST-1', type: 'ADJUST', quantity: 1 });
            }
            break;
        case "'":
            e.preventDefault();
            if (AppState.isProductLocked) {
                const prodForInc = getSelectedProduct();
                if (prodForInc) updateStock({ productName: prodForInc.name, barcode: 'KEY-IN-1', type: 'IN', quantity: 1 });
            }
            break;
    }
});

// a~l 키보드 단축키 처리
document.addEventListener('keydown', async (e) => {
    const mapping = FKEY_MAPPINGS[e.key];
    if (!mapping) return;

    // 바코드 입력 필드 외의 입력 필드에 포커스 중이면 무시 (인라인 편집 등)
    const activeEl = document.activeElement;
    if (activeEl && activeEl.id !== 'barcode-input' && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) return;

    // 편집 중이거나 다이얼로그 열려있으면 무시
    if (isEditing() || isDialogOpen()) return;

    // 제품이 고정되지 않은 상태에서는 수량 변경 불가
    if (!AppState.isProductLocked) {
        e.preventDefault();
        showScanResult('제품을 먼저 고정해주세요. (w 키로 고정)', 'error');
        return;
    }

    e.preventDefault();

    const product = getSelectedProduct();
    if (!product) {
        showScanResult('제품을 먼저 선택해주세요. ([/] 키로 선택 후 w로 고정)', 'error');
        return;
    }

    // updateStock 호출
    await updateStock({
        productName: product.name,
        type: mapping.type,
        quantity: mapping.quantity,
        barcode: 'KEYBOARD'
    });
});

// 앱 시작 시 첫 번째 제품 선택
setTimeout(() => {
    const products = getSortedProductList();
    if (products.length > 0) {
        updateSelectedProductHighlight();
    }
}, 1000);

// 사용설명서 모달
document.getElementById('btn-manual').addEventListener('click', () => {
    document.getElementById('manual-overlay').style.display = 'flex';
    renderLucideIcons();
});

document.getElementById('btn-close-manual').addEventListener('click', () => {
    document.getElementById('manual-overlay').style.display = 'none';
    document.getElementById('barcode-input').focus();
});

document.getElementById('manual-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        document.getElementById('manual-overlay').style.display = 'none';
        document.getElementById('barcode-input').focus();
    }
});

// ============================================
// 출하관리 (합배송 + 품목명 매핑 + 수동 트리거)
// ============================================

const productNameMappingsRef = database.ref('productNameMappings');

// 매핑 데이터 실시간 리스너
productNameMappingsRef.on('value', (snapshot) => {
    AppState.productNameMappings = snapshot.val() || {};
    updateMappingTable();
});

// ============================================
// 메인 탭 전환 (생산관리 / 출하관리)
// ============================================
const pageProduction = document.getElementById('page-production');
const pageShipping = document.getElementById('page-shipping');
const productionActions = document.getElementById('production-actions');
const shippingActions = document.getElementById('shipping-actions');

document.querySelectorAll('.main-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const page = tab.dataset.page;

        // 탭 활성화 상태
        document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        if (page === 'production') {
            pageProduction.style.display = '';
            pageShipping.style.display = 'none';
            productionActions.style.display = '';
            if (shippingActions) shippingActions.style.display = 'none';
            scanIndicator.style.display = 'flex';
            document.getElementById('barcode-input').focus();
        } else {
            pageProduction.style.display = 'none';
            pageShipping.style.display = '';
            productionActions.style.display = 'none';
            if (shippingActions) shippingActions.style.display = '';
            scanIndicator.style.display = 'none';
            renderLucideIcons();
            // 출고파일 현황: 오늘 날짜로 초기화
            AppState.choolgoViewDate = formatDateKey(new Date());
            // 캐시 즉시 동기 렌더링 (탭이 보이는 즉시 데이터 표시)
            const initCached = loadChoolgoCache(AppState.choolgoViewDate);
            if (initCached) renderChoolgoData(initCached.channels, initCached.products, initCached.files);
            // 이후 Firebase 최신 데이터로 갱신
            updateChoolgoSection();
        }
    });
});

// ============================================
// 출고파일 현황 섹션 — 날짜 네비게이션 & 렌더링
// ============================================

const CHOOLGO_CACHE_KEY = 'choolgoSectionCache';

function saveChoolgoCache(dateKey, channels, products, files) {
    try {
        const cache = JSON.parse(localStorage.getItem(CHOOLGO_CACHE_KEY) || '{}');
        cache[dateKey] = { channels, products, files, savedAt: Date.now() };
        // 최근 7일치만 유지
        const keys = Object.keys(cache).sort();
        if (keys.length > 7) keys.slice(0, keys.length - 7).forEach(k => delete cache[k]);
        localStorage.setItem(CHOOLGO_CACHE_KEY, JSON.stringify(cache));
    } catch (e) { /* 스토리지 오류 무시 */ }
}

function loadChoolgoCache(dateKey) {
    try {
        const cache = JSON.parse(localStorage.getItem(CHOOLGO_CACHE_KEY) || '{}');
        return cache[dateKey] || null;
    } catch (e) { return null; }
}

function renderChoolgoData(channels, products, files) {
    // 요약 카드
    const cardsEl = document.getElementById('choolgo-summary-cards');
    if (cardsEl) {
        const totalQty = Object.values(products).reduce((s, v) => s + v, 0);
        cardsEl.innerHTML = `
            <div class="choolgo-summary-card">
                <div class="card-label">총 출고 (봉)</div>
                <div class="card-value">${totalQty.toLocaleString()}</div>
            </div>
            <div class="choolgo-summary-card">
                <div class="card-label">채널 수</div>
                <div class="card-value">${Object.keys(channels).length}</div>
            </div>
            <div class="choolgo-summary-card">
                <div class="card-label">제품 종류</div>
                <div class="card-value">${Object.keys(products).length}</div>
            </div>
            <div class="choolgo-summary-card">
                <div class="card-label">처리 파일</div>
                <div class="card-value">${files.length}</div>
            </div>
        `;
    }

    // 채널별 테이블
    const channelTbody = document.getElementById('choolgo-channel-tbody');
    if (channelTbody) {
        const sorted = Object.entries(channels).sort((a, b) => b[1] - a[1]);
        channelTbody.innerHTML = sorted.length === 0
            ? '<tr><td colspan="2" class="no-data">데이터 없음</td></tr>'
            : sorted.map(([ch, qty]) => `<tr><td>${escapeHtml(ch)}</td><td>${qty.toLocaleString()}</td></tr>`).join('');
    }

    // 제품별 테이블
    const productTbody = document.getElementById('choolgo-product-tbody');
    if (productTbody) {
        const sorted = Object.entries(products).sort((a, b) => b[1] - a[1]);
        productTbody.innerHTML = sorted.length === 0
            ? '<tr><td colspan="2" class="no-data">데이터 없음</td></tr>'
            : sorted.map(([name, qty]) => `<tr><td>${escapeHtml(name)}</td><td>${qty.toLocaleString()}</td></tr>`).join('');
    }

    // 처리 파일 테이블
    const filesTbody = document.getElementById('choolgo-files-tbody');
    if (filesTbody) {
        filesTbody.innerHTML = files.length === 0
            ? '<tr><td colspan="4" class="no-data">데이터 없음</td></tr>'
            : files.map(f => {
                const timeStr = f.processedAt
                    ? new Date(f.processedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                    : '-';
                const fname = f.filename || f.fileName || '';
                const shortName = fname.split('/').pop().split('\\').pop();
                return `<tr>
                    <td title="${escapeHtml(fname)}">${escapeHtml(shortName)}</td>
                    <td>${escapeHtml(f.channel || '-')}</td>
                    <td>${(f.totalQuantity || 0).toLocaleString()}</td>
                    <td>${timeStr}</td>
                </tr>`;
            }).join('');
    }
}

async function updateChoolgoSection() {
    const dateKey = AppState.choolgoViewDate;
    const todayKey = formatDateKey(new Date());

    // 날짜 라벨 업데이트
    const labelEl = document.getElementById('choolgo-date-label');
    if (labelEl) {
        const d = new Date(dateKey + 'T00:00:00');
        const mm = d.getMonth() + 1;
        const dd = d.getDate();
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dayName = dayNames[d.getDay()];
        const isToday = dateKey === todayKey;
        labelEl.textContent = `${mm}월 ${dd}일 (${dayName})${isToday ? ' · 오늘' : ''}`;
    }

    // 다음 날 버튼: 오늘이면 비활성화
    const nextBtn = document.getElementById('btn-choolgo-next');
    if (nextBtn) nextBtn.disabled = dateKey >= todayKey;

    // 캐시 데이터 즉시 렌더링 (새로고침 후 바로 보이게)
    const cached = loadChoolgoCache(dateKey);
    if (cached) {
        renderChoolgoData(cached.channels, cached.products, cached.files);
    }

    // Firebase에서 최신 데이터 로드 (summary + files 병렬)
    const [summarySnap, filesSnap] = await Promise.all([
        database.ref(`choolgoLogs/${dateKey}/summary`).once('value'),
        database.ref(`choolgoLogs/${dateKey}/files`).once('value'),
    ]);
    const summary = summarySnap.val() || {};
    const filesObj = filesSnap.val() || {};

    const channels = summary.channels || {};
    const products = summary.products || {};
    const files = Object.values(filesObj).sort((a, b) => (b.processedAt || 0) - (a.processedAt || 0));

    // 최신 데이터로 렌더링 및 캐시 저장
    renderChoolgoData(channels, products, files);
    saveChoolgoCache(dateKey, channels, products, files);
}

function navigateChoolgoDate(delta) {
    const d = new Date(AppState.choolgoViewDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const todayKey = formatDateKey(new Date());
    const newKey = formatDateKey(d);
    if (newKey > todayKey) return; // 미래 이동 방지
    AppState.choolgoViewDate = newKey;
    updateChoolgoSection();
}

document.getElementById('btn-choolgo-prev')?.addEventListener('click', () => navigateChoolgoDate(-1));
document.getElementById('btn-choolgo-next')?.addEventListener('click', () => navigateChoolgoDate(1));

// 출하관리 헤더 단축 버튼 → 실제 파일/폴더 input 연결
document.getElementById('btn-header-folder')?.addEventListener('click', () => {
    document.getElementById('chulha-folder-input')?.click();
});
document.getElementById('btn-header-file')?.addEventListener('click', () => {
    document.getElementById('chulha-file-input')?.click();
});

// 매핑 채널 드롭다운 동적 초기화 (channel-maps.js의 ALL_CHANNEL_NAMES 사용)
(function initMappingChannelDropdown() {
    const sel = document.getElementById('mapping-channel');
    if (!sel || typeof ALL_CHANNEL_NAMES === 'undefined') return;
    const lastOpt = sel.querySelector('option[value="__other__"]');
    for (const ch of ALL_CHANNEL_NAMES) {
        const opt = document.createElement('option');
        opt.value = ch;
        opt.textContent = ch;
        sel.insertBefore(opt, lastOpt);
    }
})();

// 채널 드롭다운 "기타" 선택 시 직접 입력란 표시
document.getElementById('mapping-channel').addEventListener('change', function() {
    const otherInput = document.getElementById('mapping-channel-other');
    if (this.value === '__other__') {
        otherInput.style.display = '';
        otherInput.focus();
    } else {
        otherInput.style.display = 'none';
        otherInput.value = '';
    }
});

// 매핑 테이블 렌더링
function updateMappingTable() {
    const tbody = document.getElementById('mapping-tbody');
    if (!tbody) return;

    const mappings = AppState.productNameMappings;
    const entries = Object.entries(mappings).filter(([, v]) => v && v.pattern);

    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="no-data">매핑이 없습니다.</td></tr>';
        return;
    }

    entries.sort((a, b) => {
        const chA = (a[1].channel || '').localeCompare(b[1].channel || '');
        if (chA !== 0) return chA;
        return (b[1].priority || 0) - (a[1].priority || 0) || a[1].pattern.localeCompare(b[1].pattern);
    });

    tbody.innerHTML = entries.map(([id, m]) => `
        <tr data-mapping-id="${escapeHtml(id)}">
            <td class="mapping-editable" onclick="editMappingCell('${id}', 'channel', this)">
                ${m.channel ? `<span class="mapping-channel-badge">${escapeHtml(m.channel)}</span>` : '<span style="color:#aaa">-</span>'}
            </td>
            <td class="mapping-editable" onclick="editMappingCell('${id}', 'pattern', this)">${escapeHtml(m.pattern)}</td>
            <td class="mapping-editable" onclick="editMappingCell('${id}', 'shortName', this)">${escapeHtml(m.shortName)}</td>
            <td class="mapping-actions-cell">
                <button class="btn-mapping-edit" onclick="editMappingRow('${id}')" title="수정">
                    <i data-lucide="pencil" style="width: 14px; height: 14px; color: #3b82f6;"></i>
                </button>
                <button class="btn-mapping-delete" onclick="deleteMapping('${id}')" title="삭제">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px; color: #ef4444;"></i>
                </button>
            </td>
        </tr>
    `).join('');

    renderLucideIcons();
}

// 매핑 셀 인라인 수정
window.editMappingCell = function(id, field, td) {
    if (td.querySelector('input') || td.querySelector('select')) return;

    const rawText = td.textContent.trim();
    const currentValue = (field === 'channel' && rawText === '-') ? '' : rawText;

    td.textContent = '';
    td.classList.add('editing');

    let saved = false;
    async function save(newValue) {
        if (saved) return;
        saved = true;
        if (newValue === currentValue) {
            updateMappingTable();
            return;
        }
        await productNameMappingsRef.child(id).update({ [field]: newValue, updatedAt: Date.now() });
    }

    if (field === 'channel') {
        // 채널은 드롭다운 + 기타 입력
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;gap:4px;align-items:center;';

        const select = document.createElement('select');
        select.className = 'mapping-edit-input';
        const channels = ['', '네이버', '카카오', '아이원', '팔도감', '__other__'];
        const labels = ['선택 안함', '네이버', '카카오', '아이원', '팔도감', '기타 (직접입력)'];
        channels.forEach((v, i) => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = labels[i];
            select.appendChild(opt);
        });

        const otherInput = document.createElement('input');
        otherInput.type = 'text';
        otherInput.className = 'mapping-edit-input';
        otherInput.placeholder = '채널명';
        otherInput.style.display = 'none';

        // 현재값이 프리셋에 있으면 선택, 아니면 기타
        if (currentValue && !channels.includes(currentValue)) {
            select.value = '__other__';
            otherInput.style.display = '';
            otherInput.value = currentValue;
        } else {
            select.value = currentValue;
        }

        select.addEventListener('change', () => {
            if (select.value === '__other__') {
                otherInput.style.display = '';
                otherInput.focus();
            } else {
                otherInput.style.display = 'none';
                otherInput.value = '';
                save(select.value);
            }
        });

        otherInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); save(otherInput.value.trim()); }
            if (e.key === 'Escape') { saved = true; updateMappingTable(); }
        });
        otherInput.addEventListener('blur', () => {
            if (select.value === '__other__') save(otherInput.value.trim());
        });

        wrap.appendChild(select);
        wrap.appendChild(otherInput);
        td.appendChild(wrap);
        select.focus();
    } else {
        // 패턴/단축명은 텍스트 입력
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentValue;
        input.className = 'mapping-edit-input';

        td.appendChild(input);
        input.focus();
        input.select();

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); save(input.value.trim()); }
            if (e.key === 'Escape') { saved = true; updateMappingTable(); }
        });
        input.addEventListener('blur', () => save(input.value.trim()));
    }
};

// 매핑 추가
document.getElementById('btn-add-mapping').addEventListener('click', async () => {
    const channelSelect = document.getElementById('mapping-channel');
    const channelOther = document.getElementById('mapping-channel-other');
    const patternInput = document.getElementById('mapping-pattern');
    const shortnameInput = document.getElementById('mapping-shortname');

    const channel = channelSelect.value === '__other__'
        ? channelOther.value.trim()
        : channelSelect.value;
    const pattern = patternInput.value.trim();
    const shortName = shortnameInput.value.trim();

    if (!pattern || !shortName) {
        showScanResult('패턴과 단축명을 모두 입력해주세요.', 'error');
        return;
    }

    await productNameMappingsRef.push({
        pattern,
        shortName,
        channel: channel || '',
        priority: 10,
        createdAt: Date.now(),
        updatedAt: Date.now()
    });

    patternInput.value = '';
    shortnameInput.value = '';
    channelSelect.value = '';
    channelOther.style.display = 'none';
    channelOther.value = '';
    showScanResult(`매핑 추가: [${channel || '전체'}] "${pattern}" → "${shortName}"`, 'success');
});

// 매핑 행 전체 수정
window.editMappingRow = function(id) {
    const mappings = AppState.productNameMappings;
    const m = mappings[id];
    if (!m) return;

    const tbody = document.getElementById('mapping-tbody');
    if (!tbody) return;

    // 해당 행 찾기
    const targetRow = tbody.querySelector(`tr[data-mapping-id="${id}"]`);
    if (!targetRow) return;

    targetRow.classList.add('editing-row');
    const cells = targetRow.querySelectorAll('td');

    // 채널 셀 → select
    const channelCell = cells[0];
    const presetChannels = ['', '네이버', '카카오', '아이원', '팔도감'];
    const isPreset = presetChannels.includes(m.channel || '');
    channelCell.className = '';
    channelCell.removeAttribute('onclick');
    channelCell.innerHTML = `
        <select class="mapping-edit-input" id="edit-channel-${id}">
            <option value="">선택 안함</option>
            <option value="네이버">네이버</option>
            <option value="카카오">카카오</option>
            <option value="아이원">아이원</option>
            <option value="팔도감">팔도감</option>
            <option value="__other__">기타</option>
        </select>
        <input type="text" class="mapping-edit-input" id="edit-channel-other-${id}" placeholder="채널명" style="display:none;margin-top:4px;">
    `;
    const sel = document.getElementById(`edit-channel-${id}`);
    const otherInp = document.getElementById(`edit-channel-other-${id}`);
    if (isPreset) {
        sel.value = m.channel || '';
    } else {
        sel.value = '__other__';
        otherInp.style.display = '';
        otherInp.value = m.channel || '';
    }
    sel.addEventListener('change', () => {
        otherInp.style.display = sel.value === '__other__' ? '' : 'none';
    });

    // 패턴 셀 → input
    const patternCell = cells[1];
    patternCell.className = '';
    patternCell.removeAttribute('onclick');
    patternCell.innerHTML = `<input type="text" class="mapping-edit-input" id="edit-pattern-${id}" value="${escapeHtml(m.pattern)}">`;

    // 단축명 셀 → input
    const shortNameCell = cells[2];
    shortNameCell.className = '';
    shortNameCell.removeAttribute('onclick');
    shortNameCell.innerHTML = `<input type="text" class="mapping-edit-input" id="edit-shortname-${id}" value="${escapeHtml(m.shortName)}">`;

    // 관리 셀 → 저장/취소
    const actionCell = cells[3];
    actionCell.innerHTML = `
        <button class="btn-mapping-save" onclick="saveMappingRow('${id}')" title="저장">
            <i data-lucide="check" style="width: 14px; height: 14px; color: #22c55e;"></i>
        </button>
        <button class="btn-mapping-cancel" onclick="cancelMappingRow()" title="취소">
            <i data-lucide="x" style="width: 14px; height: 14px; color: #6b7280;"></i>
        </button>
    `;

    renderLucideIcons();

    // Enter → 저장, Escape → 취소
    const editInputs = targetRow.querySelectorAll('input, select');
    for (const inp of editInputs) {
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); saveMappingRow(id); }
            if (e.key === 'Escape') { cancelMappingRow(); }
        });
    }

    // 패턴 입력에 포커스
    document.getElementById(`edit-pattern-${id}`).focus();
};

// 매핑 행 저장
window.saveMappingRow = async function(id) {
    const sel = document.getElementById(`edit-channel-${id}`);
    const otherInp = document.getElementById(`edit-channel-other-${id}`);
    const patternInp = document.getElementById(`edit-pattern-${id}`);
    const shortNameInp = document.getElementById(`edit-shortname-${id}`);

    if (!sel || !patternInp || !shortNameInp) return;

    const channel = sel.value === '__other__' ? (otherInp.value.trim()) : sel.value;
    const pattern = patternInp.value.trim();
    const shortName = shortNameInp.value.trim();

    if (!pattern || !shortName) {
        showScanResult('패턴과 단축명을 모두 입력해주세요.', 'error');
        return;
    }

    try {
        await productNameMappingsRef.child(id).update({
            channel: channel || '',
            pattern,
            shortName,
            updatedAt: Date.now()
        });
        showScanResult(`매핑 수정: [${channel || '전체'}] "${pattern}" → "${shortName}"`, 'success');
    } catch (err) {
        showScanResult(`매핑 수정 오류: ${err.message}`, 'error');
    }
};

// 매핑 행 수정 취소
window.cancelMappingRow = function() {
    updateMappingTable();
};

// 매핑 삭제
window.deleteMapping = async function(id) {
    if (!confirm('이 매핑을 삭제하시겠습니까?')) return;
    try {
        await productNameMappingsRef.child(id).remove();
        showScanResult('매핑이 삭제되었습니다.', 'success');
    } catch (err) {
        showScanResult(`매핑 삭제 오류: ${err.message}`, 'error');
    }
};

// ============================================
// 출하관리: 브라우저 기반 파일 처리
// ============================================

// 선택된 파일 및 결과 저장
let chulhaSelectedFiles = [];
let chulhaCourierWorkbook = null;

// 폴더 선택 버튼
document.getElementById('btn-chulha-folder').addEventListener('click', () => {
    document.getElementById('chulha-folder-input').click();
});

// 파일 선택 버튼
document.getElementById('btn-chulha-files').addEventListener('click', () => {
    document.getElementById('chulha-file-input').click();
});

// 폴더 input 변경
document.getElementById('chulha-folder-input').addEventListener('change', (e) => {
    handleChulhaFileSelection(e.target.files);
    e.target.value = ''; // 같은 폴더 재선택 허용
});

// 파일 input 변경
document.getElementById('chulha-file-input').addEventListener('change', (e) => {
    handleChulhaFileSelection(e.target.files);
    e.target.value = '';
});

function handleChulhaFileSelection(fileList) {
    // 엑셀 파일만 필터링 (임시파일·출력파일 제외)
    const files = Array.from(fileList).filter(f =>
        f.name.match(/\.xlsx?$/i) && !f.name.startsWith('~$') && !f.name.includes('택배양식')
    );

    if (files.length === 0) {
        alert('처리할 엑셀 파일이 없습니다.');
        return;
    }

    chulhaSelectedFiles = files;

    // 미리보기 표시
    const previewDiv = document.getElementById('chulha-file-preview');
    const fileListDiv = document.getElementById('chulha-file-list');
    const resultsDiv = document.getElementById('chulha-results');
    const statusEl = document.getElementById('chulha-status');

    resultsDiv.style.display = 'none';
    statusEl.textContent = '';
    statusEl.className = 'chulha-status';

    let html = '<table class="chulha-result-table"><thead><tr><th>파일명</th><th>채널(예상)</th><th>크기</th></tr></thead><tbody>';
    for (const f of files) {
        const channel = detectChannelBrowser(f);
        const size = f.size < 1024 ? `${f.size}B` : `${Math.round(f.size / 1024)}KB`;
        html += `<tr><td>${escapeHtml(f.name)}</td><td>${channel ? escapeHtml(channel.name) : '-'}</td><td>${size}</td></tr>`;
    }
    html += '</tbody></table>';
    fileListDiv.innerHTML = html;
    previewDiv.style.display = 'block';

    // Lucide 아이콘 갱신
    renderLucideIcons();
}

// 취소 버튼
document.getElementById('btn-chulha-cancel').addEventListener('click', () => {
    chulhaSelectedFiles = [];
    chulhaCourierWorkbook = null;
    document.getElementById('chulha-file-preview').style.display = 'none';
    document.getElementById('chulha-results').style.display = 'none';
    document.getElementById('btn-chulha-download').style.display = 'none';
});

// 택배양식 생성 버튼
document.getElementById('btn-chulha-process').addEventListener('click', async () => {
    if (AppState.chulhaProcessing || chulhaSelectedFiles.length === 0) return;
    AppState.chulhaProcessing = true;

    const btn = document.getElementById('btn-chulha-process');
    const statusEl = document.getElementById('chulha-status');
    const resultsDiv = document.getElementById('chulha-results');
    const resultsBody = document.getElementById('chulha-results-body');
    const downloadBtn = document.getElementById('btn-chulha-download');

    btn.disabled = true;
    statusEl.textContent = '처리 중...';
    statusEl.className = 'chulha-status processing';
    resultsDiv.style.display = 'none';
    downloadBtn.style.display = 'none';

    try {
        const data = await processSelectedFiles(chulhaSelectedFiles);

        // 결과 표시
        const totalRows = data.allRows.length;
        const consolidatedRows = data.consolidated.length;

        if (totalRows === 0) {
            statusEl.textContent = '추출된 배송 행이 없습니다. 파일 형식을 확인해주세요.';
            statusEl.className = 'chulha-status error';
        } else {
            statusEl.textContent = `완료: ${data.results.length}개 파일, 택배양식 ${totalRows}행 → ${consolidatedRows}행 (합배송)`;
            statusEl.className = 'chulha-status success';
        }

        renderProcessResults(data.results, resultsBody);
        resultsDiv.style.display = 'block';

        // 다운로드 버튼 활성화
        if (data.workbook) {
            chulhaCourierWorkbook = data.workbook;
            downloadBtn.style.display = 'inline-flex';
        }

        // 미매핑 상품 팝업
        if (data.unmappedProducts && data.unmappedProducts.length > 0) {
            showUnmappedModal(data.unmappedProducts);
        }
    } catch (err) {
        statusEl.textContent = `처리 오류: ${err.message}`;
        statusEl.className = 'chulha-status error';
    }

    btn.disabled = false;
    AppState.chulhaProcessing = false;

    renderLucideIcons();
});

// 다운로드 버튼
document.getElementById('btn-chulha-download').addEventListener('click', () => {
    if (!chulhaCourierWorkbook) return;
    downloadCourierXlsx(chulhaCourierWorkbook);
});

// ============================================
// 미매핑 상품 모달
// ============================================

function showUnmappedModal(unmappedProducts) {
    const overlay = document.getElementById('unmapped-overlay');
    const tbody = document.getElementById('unmapped-tbody');
    if (!overlay || !tbody) return;

    tbody.innerHTML = unmappedProducts.map((item, i) => `
        <tr>
            <td>${escapeHtml(item.originalName)}</td>
            <td>${item.count}</td>
            <td><input type="text" id="unmapped-input-${i}" data-original="${encodeURIComponent(item.originalName)}" placeholder="단축명 입력"></td>
        </tr>
    `).join('');

    overlay.style.display = 'flex';
    renderLucideIcons();

    // 첫 번째 입력에 포커스
    const firstInput = document.getElementById('unmapped-input-0');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
}

function hideUnmappedModal() {
    const overlay = document.getElementById('unmapped-overlay');
    if (overlay) overlay.style.display = 'none';
}

// 닫기 버튼
document.getElementById('btn-close-unmapped').addEventListener('click', hideUnmappedModal);

// 건너뛰기 버튼
document.getElementById('btn-unmapped-skip').addEventListener('click', hideUnmappedModal);

// 오버레이 클릭으로 닫기
document.getElementById('unmapped-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'unmapped-overlay') hideUnmappedModal();
});

// 저장 후 재생성 버튼
let unmappedSaving = false;
document.getElementById('btn-unmapped-save').addEventListener('click', async () => {
    if (unmappedSaving) return;
    unmappedSaving = true;

    const inputs = document.querySelectorAll('#unmapped-tbody input[type="text"]');
    const newMappings = [];

    for (const input of inputs) {
        const shortName = input.value.trim();
        if (!shortName) continue;
        const originalName = decodeURIComponent(input.dataset.original);
        newMappings.push({ pattern: originalName, shortName });
    }

    if (newMappings.length === 0) {
        unmappedSaving = false;
        hideUnmappedModal();
        return;
    }

    // Firebase에 매핑 저장
    const saveBtn = document.getElementById('btn-unmapped-save');
    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';

    try {
        for (const m of newMappings) {
            await productNameMappingsRef.push({
                pattern: m.pattern,
                shortName: m.shortName,
                channel: '',
                priority: 10,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        // 최신 매핑 데이터로 재처리
        hideUnmappedModal();

        if (chulhaSelectedFiles.length > 0) {
            // 매핑 데이터 갱신 대기
            const snap = await productNameMappingsRef.once('value');
            AppState.productNameMappings = snap.val() || {};

            // 재처리
            const data = await processSelectedFiles(chulhaSelectedFiles);
            const statusEl = document.getElementById('chulha-status');
            const resultsBody = document.getElementById('chulha-results-body');
            const downloadBtn = document.getElementById('btn-chulha-download');

            const totalRows = data.allRows.length;
            const consolidatedRows = data.consolidated.length;
            statusEl.textContent = `재생성 완료: ${data.results.length}개 파일, 택배양식 ${totalRows}행 → ${consolidatedRows}행 (합배송)`;
            statusEl.className = 'chulha-status success';

            renderProcessResults(data.results, resultsBody);

            if (data.workbook) {
                chulhaCourierWorkbook = data.workbook;
                downloadBtn.style.display = 'inline-flex';
            }

            // 미매핑이 여전히 있으면 다시 팝업
            if (data.unmappedProducts && data.unmappedProducts.length > 0) {
                showUnmappedModal(data.unmappedProducts);
            }
        }

        showScanResult(`${newMappings.length}개 매핑이 추가되었습니다.`, 'success');
    } catch (err) {
        showScanResult(`매핑 저장 오류: ${err.message}`, 'error');
    }

    saveBtn.disabled = false;
    saveBtn.textContent = '저장 후 재생성';
    unmappedSaving = false;
});

function renderProcessResults(results, container) {
    if (!results || results.length === 0) {
        container.innerHTML = '<p class="no-data">처리할 파일이 없습니다.</p>';
        return;
    }
    let html = '<table class="chulha-result-table"><thead><tr><th>파일명</th><th>채널</th><th>상태</th></tr></thead><tbody>';
    for (const r of results) {
        let statusBadge;
        if (r.error) {
            statusBadge = `<span class="result-badge result-badge-error">✗ ${escapeHtml(r.error)}</span>`;
        } else if (!r.channel || r.channel === '-') {
            statusBadge = `<span class="result-badge result-badge-warn">채널 불명</span>`;
        } else {
            let badge = `<span class="result-badge result-badge-ok">✓ ${r.shippingRows}행</span>`;
            if (r.skippedEmptyProduct > 0) {
                badge += ` <span class="result-badge result-badge-warn" title="상품명이 비어있어 건너뛴 행">⚠ ${r.skippedEmptyProduct}행 제외</span>`;
            }
            statusBadge = badge;
        }
        html += `<tr><td>${escapeHtml(r.filename)}</td><td>${escapeHtml(r.channel || '-')}</td><td>${statusBadge}</td></tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
}

// ============================================
// 이메일 자동 처리 관리
// ============================================

// 비밀번호 암호화 (간단한 Base64 인코딩 - 실제로는 더 강력한 암호화 필요)
function encryptPassword(password) {
    return btoa(password);  // Base64 인코딩
}

function decryptPassword(encrypted) {
    try {
        return atob(encrypted);  // Base64 디코딩
    } catch (e) {
        return '';
    }
}

// 이메일 계정 UI 업데이트
function updateEmailAccountUI() {
    const account = AppState.emailSettings.account;
    const emailInput = document.getElementById('email-account-email');
    const passwordInput = document.getElementById('email-account-password');

    if (emailInput && account.email) {
        emailInput.value = account.email || '';
    }

    // 비밀번호는 보안상 표시하지 않음 (플레이스홀더만 변경)
    if (passwordInput && account.password) {
        passwordInput.placeholder = '••••••••••••••••';
    }
}

// 발신자 규칙 테이블 렌더링
function updateSenderRulesTable() {
    const tbody = document.getElementById('sender-rules-tbody');
    if (!tbody) return;

    const rules = AppState.emailSettings.senderRules;
    const ruleArray = Object.entries(rules).map(([id, rule]) => ({
        id,
        ...rule
    }));

    // 우선순위 내림차순 정렬
    ruleArray.sort((a, b) => (b.priority || 10) - (a.priority || 10));

    if (ruleArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #9ca3af; padding: 30px;">발신자 규칙이 없습니다. "규칙 추가" 버튼을 눌러 추가하세요.</td></tr>';
        return;
    }

    tbody.innerHTML = ruleArray.map(rule => `
        <tr>
            <td><code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em;">${escapeHtml(rule.pattern)}</code></td>
            <td><span style="background: #dbeafe; color: #1e40af; padding: 3px 8px; border-radius: 4px; font-size: 0.85em; font-weight: 500;">${escapeHtml(rule.channel)}</span></td>
            <td>${escapeHtml(rule.folder)}</td>
            <td style="color: #6b7280; font-size: 0.9em;">${escapeHtml(rule.description || '-')}</td>
            <td style="text-align: center;">${rule.priority || 10}</td>
            <td style="text-align: center;">
                <button class="btn-icon" onclick="editSenderRule('${rule.id}')" title="수정">
                    <i data-lucide="pencil" style="width: 14px; height: 14px;"></i>
                </button>
                <button class="btn-icon" onclick="deleteSenderRule('${rule.id}')" title="삭제" style="color: #ef4444;">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </td>
        </tr>
    `).join('');

    lucide.createIcons();
}

// 이메일 계정 정보 저장
async function saveEmailAccount() {
    const email = document.getElementById('email-account-email').value.trim();
    const password = document.getElementById('email-account-password').value.trim();
    const statusDiv = document.getElementById('email-account-status');

    if (!email || !password) {
        statusDiv.innerHTML = '⚠️ 이메일과 비밀번호를 모두 입력하세요.';
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#fef3c7';
        statusDiv.style.color = '#92400e';
        return;
    }

    if (!email.includes('@naver.com')) {
        statusDiv.innerHTML = '⚠️ 네이버 이메일 주소를 입력하세요. (@naver.com)';
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#fef3c7';
        statusDiv.style.color = '#92400e';
        return;
    }

    try {
        await emailSettingsRef.child('account').set({
            email: email,
            password: encryptPassword(password),
            host: 'imap.naver.com',
            port: 993,
            tls: true,
            pollInterval: 60000,
            updatedAt: Date.now()
        });

        statusDiv.innerHTML = '✓ 계정 정보가 저장되었습니다. choolgo-watcher를 재시작하세요.';
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#d1fae5';
        statusDiv.style.color = '#065f46';

        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    } catch (error) {
        statusDiv.innerHTML = `✗ 저장 실패: ${error.message}`;
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#fee2e2';
        statusDiv.style.color = '#991b1b';
    }
}


// 발신자 규칙 추가 모달 열기
function openSenderRuleModal(ruleId = null) {
    const modal = document.getElementById('sender-rule-modal');
    const form = document.getElementById('sender-rule-form');
    const title = document.getElementById('sender-rule-modal-title');

    AppState.editingSenderRuleId = ruleId;

    if (ruleId) {
        // 수정 모드
        const rule = AppState.emailSettings.senderRules[ruleId];
        if (rule) {
            title.textContent = '거래처 수정';
            document.getElementById('rule-pattern').value = rule.pattern || '';
            document.getElementById('rule-channel').value = rule.channel || '';
            document.getElementById('rule-folder').value = rule.folder || '직택배';
            document.getElementById('rule-description').value = rule.description || '';
            document.getElementById('rule-priority').value = rule.priority || 10;
        }
    } else {
        // 추가 모드
        title.textContent = '거래처 추가';
        form.reset();
        document.getElementById('rule-folder').value = '직택배';
        document.getElementById('rule-priority').value = 10;
    }

    modal.style.display = 'flex';
    lucide.createIcons();
}

// 발신자 규칙 추가 모달 닫기
function closeSenderRuleModal() {
    const modal = document.getElementById('sender-rule-modal');
    modal.style.display = 'none';
    AppState.editingSenderRuleId = null;
}

// 발신자 규칙 저장
async function saveSenderRule(event) {
    event.preventDefault();

    const pattern = document.getElementById('rule-pattern').value.trim();
    const channel = document.getElementById('rule-channel').value.trim();
    const folder = document.getElementById('rule-folder').value;
    const description = document.getElementById('rule-description').value.trim();
    const priority = parseInt(document.getElementById('rule-priority').value) || 10;

    if (!pattern || !channel) {
        showScanResult('발신자 패턴과 채널명을 입력하세요.', 'error');
        return;
    }

    try {
        const ruleData = {
            pattern,
            channel,
            folder,
            description,
            priority,
            updatedAt: Date.now()
        };

        if (AppState.editingSenderRuleId) {
            // 수정
            await emailSettingsRef.child(`senderRules/${AppState.editingSenderRuleId}`).update(ruleData);
            showScanResult('발신자 규칙이 수정되었습니다.', 'success');
        } else {
            // 추가
            const newRuleRef = emailSettingsRef.child('senderRules').push();
            await newRuleRef.set(ruleData);
            showScanResult('발신자 규칙이 추가되었습니다.', 'success');
        }

        closeSenderRuleModal();
    } catch (error) {
        showScanResult(`저장 실패: ${error.message}`, 'error');
    }
}

// 발신자 규칙 수정
function editSenderRule(ruleId) {
    openSenderRuleModal(ruleId);
}

// 발신자 규칙 삭제
async function deleteSenderRule(ruleId) {
    const rule = AppState.emailSettings.senderRules[ruleId];
    if (!rule) return;

    if (!confirm(`"${rule.pattern}" 규칙을 삭제하시겠습니까?`)) {
        return;
    }

    try {
        await emailSettingsRef.child(`senderRules/${ruleId}`).remove();
        showScanResult('발신자 규칙이 삭제되었습니다.', 'success');
    } catch (error) {
        showScanResult(`삭제 실패: ${error.message}`, 'error');
    }
}

// 이벤트 리스너 등록
document.addEventListener('DOMContentLoaded', () => {
    // 이메일 계정 저장
    const btnSaveAccount = document.getElementById('btn-save-email-account');
    if (btnSaveAccount) {
        btnSaveAccount.addEventListener('click', saveEmailAccount);
    }

    // 발신자 규칙 추가 버튼
    const btnAddRule = document.getElementById('btn-add-sender-rule');
    if (btnAddRule) {
        btnAddRule.addEventListener('click', () => openSenderRuleModal());
    }

    // 발신자 규칙 모달 닫기
    const btnCloseModal = document.getElementById('btn-close-sender-rule-modal');
    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', closeSenderRuleModal);
    }

    const btnCancelModal = document.getElementById('btn-cancel-sender-rule');
    if (btnCancelModal) {
        btnCancelModal.addEventListener('click', closeSenderRuleModal);
    }

    // 발신자 규칙 폼 제출
    const ruleForm = document.getElementById('sender-rule-form');
    if (ruleForm) {
        ruleForm.addEventListener('submit', saveSenderRule);
    }

    // 모달 외부 클릭 시 닫기
    const senderRuleModal = document.getElementById('sender-rule-modal');
    if (senderRuleModal) {
        senderRuleModal.addEventListener('click', (e) => {
            if (e.target === senderRuleModal) {
                closeSenderRuleModal();
            }
        });
    }
});

console.log('우리곡간식품 재고관리 시스템이 시작되었습니다!');
