// Firebase 데이터베이스 참조
const database = firebase.database();
const productsRef = database.ref('products');
const barcodesRef = database.ref('barcodes');
const historyRef = database.ref('history');
const dailyClosingsRef = database.ref('dailyClosings');

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
    currentWorkingProduct: null  // 현재 작업 중인 제품 (강조 표시용)
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

// 제품 목록 실시간 감지
productsRef.on('value', (snapshot) => {
    AppState.productsData = snapshot.val() || {};
    updateSortedProductNames();
    migrateProductIndices();
    updateInventoryTable();
    updateProductionHistoryTable();
    updateHistoryTable();
    updateBarcodeTable();
    updateDashboard();
});

// 바코드 목록 실시간 감지
barcodesRef.on('value', (snapshot) => {
    AppState.barcodesData = snapshot.val() || {};
    console.log('Firebase에서 바코드 데이터 업데이트:', Object.keys(AppState.barcodesData).length, '개');
    console.log('바코드 목록:', Object.keys(AppState.barcodesData));
    migrateProductIndices();
    updateBarcodeTable();
    updateInventoryTable();
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
    updateDashboard();
});

// 마감 기록 실시간 감지 (최근 7일)
dailyClosingsRef.orderByKey().limitToLast(7).on('value', (snapshot) => {
    AppState.dailyClosingsData = snapshot.val() || {};
    console.log('Firebase에서 마감 기록 업데이트:', Object.keys(AppState.dailyClosingsData).length, '개');
    updateHistoryTable();  // 금일 생산현황 테이블도 업데이트 (수정된 값 반영)
    updateProductionHistoryTable();
    updateDashboard();
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

    // 금일 생산현황 테이블의 currentStock 값을 직접 사용 (카테고리별 합계)
    let catNurungji = 0, catSeoridae = 0, catPpungtwigi = 0;
    products.forEach(product => {
        const stock = product.currentStock || 0;
        if (product.name.includes('누룽지')) catNurungji += stock;
        else if (product.name.includes('서리태')) catSeoridae += stock;
        else if (product.name.includes('뻥튀기')) catPpungtwigi += stock;
    });

    // 출고량 계산 (히스토리 기반, dailyClosings 수정값 반영)
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

    let todayShipment = 0;
    Object.entries(groupedShipment).forEach(([productName, data]) => {
        const editedData = editedProducts[productName];
        let displayQuantity = data.totalQuantity;
        if (editedData && editedData.editedAt && editedData.shipment !== undefined) {
            displayQuantity = editedData.shipment;
        }
        todayShipment += displayQuantity;
    });

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

    // Lucide 아이콘 렌더링
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
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

    // 각 날짜별 카테고리별 생산량 계산
    const dailyData = dates.map(d => {
        const closing = closings[d.key];
        const categoryTotals = {};

        categories.forEach(cat => {
            categoryTotals[cat.keyword] = 0;
        });

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

        const total = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);
        return { ...d, categoryTotals, total };
    });

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
            const height = (value / maxValue) * 100;
            return `<div class="bar-grouped" style="height: ${height}px; background: ${cat.color};" title="${cat.name}: ${value}"></div>`;
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

// 재고 테이블 업데이트
function updateInventoryTable() {
    const products = filterValidProducts(AppState.productsData);
    console.log('제품 데이터:', products);

    if (products.length === 0) {
        inventoryTbody.innerHTML = '<tr><td colspan="5" class="no-data">제품이 없습니다.</td></tr>';
        return;
    }

    // 정렬: sortOrder가 있는 제품 우선, 그 다음 기존 로직 (부족한 수량 순)
    const sortedProducts = products.sort((a, b) => {
        const orderA = a.sortOrder;
        const orderB = b.sortOrder;

        // 둘 다 sortOrder가 있으면 sortOrder 순
        if (orderA !== undefined && orderA !== null &&
            orderB !== undefined && orderB !== null) {
            return orderA - orderB;
        }

        // sortOrder가 있는 쪽이 먼저
        if (orderA !== undefined && orderA !== null) return -1;
        if (orderB !== undefined && orderB !== null) return 1;

        // 둘 다 없으면 기존 로직 (부족한 수량 순)
        const minStockA = a.minStock || 0;
        const minStockB = b.minStock || 0;

        // 목표 재고가 0인 항목은 맨 아래
        if (minStockA === 0 && minStockB !== 0) return 1;
        if (minStockA !== 0 && minStockB === 0) return -1;
        if (minStockA === 0 && minStockB === 0) return 0;

        // 부족한 수량 계산 (목표 - 현재)
        const shortageA = minStockA - (a.currentStock || 0);
        const shortageB = minStockB - (b.currentStock || 0);

        // 부족한 수량이 많은 순서대로 (내림차순)
        return shortageB - shortageA;
    });

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

        console.log('제품:', product.name, '현재재고:', product.currentStock, '목표재고:', minStock, '부족수량:', shortage);

        // 제품명 기반 고유 색상 클래스 (1~20)
        const colorIndex = getProductColorIndex(product.name) + 1;
        const colorClass = `product-color-${colorIndex}`;

        return `
            <tr class="${colorClass}" data-product="${product.name}">
                <td class="drag-handle" title="드래그하여 순서 변경">
                    <i data-lucide="grip-vertical" style="width: 18px; height: 18px; opacity: 0.5;"></i>
                </td>
                <td><strong>${product.name}</strong></td>
                <td class="stock-number editable-stock" data-product="${product.name}" data-stock="${product.currentStock}" onclick="editCurrentStock(this)" title="클릭하여 수정"><strong>${product.currentStock}</strong> <i data-lucide="edit-2" style="width: 20px; height: 20px; display: inline-block; vertical-align: middle; opacity: 0.6;"></i></td>
                <td class="stock-number editable-stock" data-product="${product.name}" data-minstock="${minStock}" onclick="editMinStock(this)" title="클릭하여 수정"><span class="min-stock-value">${minStock}</span> <i data-lucide="edit-2" style="width: 20px; height: 20px; display: inline-block; vertical-align: middle; opacity: 0.6;"></i></td>
                <td>
                    <span class="stock-status ${stockStatus}">${stockText}</span>
                    <button onclick="changeProductColor('${product.name}')" class="btn-change-color" title="색상 변경" style="margin-left: 8px; padding: 4px 8px; border: none; background: rgba(0,0,0,0.1); border-radius: 4px; cursor: pointer; font-size: 0.85em;">
                        <i data-lucide="palette" style="width: 14px; height: 14px; vertical-align: middle;"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Lucide 아이콘 다시 렌더링
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // 드래그앤드롭 정렬 초기화
    if (typeof Sortable !== 'undefined') {
        initInventoryDragAndDrop();
    }

    // 현재 작업 제품 강조 복원
    restoreWorkingProductHighlight();
}

// 목표 재고 수정 함수
function editMinStock(element) {
    // 이미 편집 중인 경우 무시
    if (element.querySelector('input')) return;

    // data 속성에서 제품명과 현재값 가져오기
    const productName = element.getAttribute('data-product');
    const currentValue = parseInt(element.getAttribute('data-minstock')) || 0;

    console.log('목표재고 수정 시작:', productName, '현재값:', currentValue);

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

            // 아이콘 다시 렌더링
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

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

    console.log('현재 재고 수정 시작:', productName, '현재값:', currentValue);

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

            // 아이콘 다시 렌더링
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

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

    // Lucide 아이콘 다시 렌더링
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // 현재 작업 제품 강조 복원
    restoreWorkingProductHighlight();
}

// 생산 현황 테이블 업데이트 (7일치 마감 기록 기반)
function updateProductionHistoryTable() {
    const validProducts = filterValidProducts(AppState.productsData);
    const closings = AppState.dailyClosingsData;

    // 금일 생산현황과 동일한 순서로 정렬 (sortOrder 기반)
    const sortedProducts = validProducts.sort((a, b) => {
        const orderA = a.sortOrder;
        const orderB = b.sortOrder;

        // 둘 다 sortOrder가 있으면 sortOrder 순
        if (orderA !== undefined && orderA !== null &&
            orderB !== undefined && orderB !== null) {
            return orderA - orderB;
        }

        // sortOrder가 있는 쪽이 먼저
        if (orderA !== undefined && orderA !== null) return -1;
        if (orderB !== undefined && orderB !== null) return 1;

        // 둘 다 없으면 기존 로직 (부족한 수량 순)
        const minStockA = a.minStock || 0;
        const minStockB = b.minStock || 0;

        if (minStockA === 0 && minStockB !== 0) return 1;
        if (minStockA !== 0 && minStockB === 0) return -1;
        if (minStockA === 0 && minStockB === 0) return 0;

        const shortageA = minStockA - (a.currentStock || 0);
        const shortageB = minStockB - (b.currentStock || 0);
        return shortageB - shortageA;
    });

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

    // 테이블 헤더 생성
    let theadHtml = '<tr><th>제품명</th>';
    dates.forEach(d => {
        theadHtml += `<th>${d.displayDate}${d.isToday ? '<br>(오늘)' : ''}</th>`;
    });
    theadHtml += '</tr>';
    productionHistoryThead.innerHTML = theadHtml;

    // 제품이 없으면 빈 메시지 표시
    if (sortedProducts.length === 0) {
        productionHistoryTbody.innerHTML = `<tr><td colspan="${daysToShow + 1}" class="no-data">등록된 제품이 없습니다.</td></tr>`;
        return;
    }

    // 테이블 바디 생성
    let tbodyHtml = '';
    sortedProducts.forEach(product => {
        const productName = product.name;
        const colorIndex = getProductColorIndex(productName) + 1;
        const colorClass = `product-color-${colorIndex}`;

        tbodyHtml += `<tr class="${colorClass}"><td><strong>${productName}</strong></td>`;

        dates.forEach(d => {
            const closing = closings[d.dateKey];
            let production = 0;

            if (closing && closing.products && closing.products[productName]) {
                production = closing.products[productName].production || 0;
            }

            // 클릭하면 편집 가능하도록 설정
            const cellClass = 'production-editable';
            const cellData = `data-date="${d.dateKey}" data-product="${productName}" onclick="editProductionValue(this)"`;

            if (production > 0) {
                tbodyHtml += `<td class="${cellClass}" ${cellData}><span class="transaction-type transaction-in">${production}</span></td>`;
            } else {
                tbodyHtml += `<td class="${cellClass} no-data-cell" ${cellData}>-</td>`;
            }
        });

        tbodyHtml += '</tr>';
    });

    productionHistoryTbody.innerHTML = tbodyHtml;

    // Lucide 아이콘 다시 렌더링
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // 현재 작업 제품 강조 복원
    restoreWorkingProductHighlight();
}

// 바코드 관리 테이블 업데이트
function updateBarcodeTable() {
    const products = filterValidProducts(AppState.productsData);
    const barcodes = filterValidBarcodes(AppState.barcodesData);

    console.log('제품 데이터:', products);
    console.log('바코드 데이터:', barcodes);

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

        html += `
            <tr class="${colorClass}">
                <td class="product-name-cell"><strong>${productName}</strong></td>
                <td>${inQuantities}</td>
                <td>${outQuantities}</td>
                <td>
                    <button class="btn-edit-barcode" onclick="editProduct('${productName}')" title="제품 수정">
                        <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button class="btn-delete-barcode" onclick="deleteProduct('${productName}')" title="제품 삭제">
                        <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    barcodeTbody.innerHTML = html;

    // Lucide 아이콘 다시 렌더링
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    console.log('바코드 테이블 업데이트 완료');
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

    const beforeStock = product.currentStock || 0;
    let afterStock;

    if (type === 'IN') {
        afterStock = beforeStock + quantity;
    } else if (type === 'OUT') {
        afterStock = beforeStock - quantity;
        if (afterStock < 0) {
            showScanResult('재고가 부족합니다!', 'error');
            return;
        }
    } else {
        // VIEW 타입 - 조회만
        showScanResult(`${productName} - 현재 재고: ${beforeStock}개`, 'success');
        highlightProductRow(productName);
        return;
    }

    try {
        // 제품 재고 업데이트
        await productsRef.child(productName).update({
            currentStock: afterStock,
            updatedAt: Date.now()
        });

        // 히스토리 추가
        await historyRef.push({
            productName: productName,
            barcode: barcodeInfo.barcode,
            type: type,
            quantity: quantity,
            beforeStock: beforeStock,
            afterStock: afterStock,
            timestamp: Date.now()
        });

        const typeText = type === 'IN' ? '생산' : '출고';
        showScanResult(`${productName} ${typeText} 완료! (${beforeStock} → ${afterStock})`, 'success');

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

        // 디버깅: 스캔한 바코드와 등록된 바코드 목록 출력
        console.log('=== 바코드 스캔 디버깅 ===');
        console.log('스캔한 바코드:', barcode);
        console.log('바코드 길이:', barcode.length);
        console.log('등록된 바코드 목록:', Object.keys(AppState.barcodesData));

        // 바코드 정보 조회
        const barcodeInfo = findBarcodeInfo(barcode);

        console.log('조회된 바코드 정보:', barcodeInfo);

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
        // Lucide 아이콘 다시 렌더링
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
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
        // Lucide 아이콘 다시 렌더링
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
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

            console.log(`기존 바코드 ${relatedBarcodes.length}개 삭제 중...`);
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
                    console.log(`  고아 바코드 이동: ${orphan.barcode} → ${newKey}`);
                } else {
                    // 올바른 인덱스를 모르면 그냥 삭제 (해당 제품 수정 시 재생성됨)
                    await barcodesRef.child(orphan.barcode).remove();
                    console.log(`  고아 바코드 삭제: ${orphan.barcode}`);
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
        console.log(`생산 바코드 생성 시작 (제품 인덱스: ${productIndex})`);
        for (const quantity of uniqueQuantitiesIn) {
            const barcodeIn = `P${productIndex}-IN-${quantity}`;
            console.log(`생성할 바코드: ${barcodeIn}`);
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
        console.log(`출고 바코드 생성 시작`);
        for (const quantity of uniqueQuantitiesOut) {
            const barcodeOut = `P${productIndex}-OUT-${quantity}`;
            console.log(`생성할 바코드: ${barcodeOut}`);
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
        console.log(`조회 바코드 생성: ${barcodeView}`);
        await barcodesRef.child(barcodeView).set({
            barcode: barcodeView,
            productName: productName,
            type: 'VIEW',
            quantity: 0,
            createdAt: Date.now()
        });
        barcodeCount++;

        console.log(`총 ${barcodeCount}개의 바코드 생성 완료`);

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

        html += `
        <div class="product-row" data-product="${product.name}">
            <div class="product-row-header">${product.name}</div>
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

        html += `
        <div class="product-row" data-product="${product.name}">
            <div class="product-row-header">${product.name}</div>
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
// 단, 제품 등록 섹션/설정 섹션이 열려있거나 편집 중일 때는 제외
barcodeInput.addEventListener('blur', () => {
    setTimeout(() => {
        if (productRegisterSection.style.display === 'none' &&
            settingsSection.style.display === 'none' &&
            !AppState.isEditingMinStock &&
            !AppState.isEditingCurrentStock &&
            !AppState.isEditingProduction) {
            barcodeInput.focus();
        }
    }, 100);
});

// 화면 클릭 시에도 포커스 유지 (제품 등록/설정 섹션이 닫혀있고 편집 중이 아닐 때만)
document.addEventListener('click', (e) => {
    if (productRegisterSection.style.display === 'none' &&
        settingsSection.style.display === 'none' &&
        !AppState.isEditingMinStock &&
        !AppState.isEditingCurrentStock &&
        !AppState.isEditingProduction) {
        barcodeInput.focus();
    }
});

// ============================================
// 금일 마감 기능
// ============================================

// 금일 마감 실행
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
        // 금일 생산현황 테이블에서 currentStock 값을 직접 읽어오기
        const productSummary = {};
        const inventoryRows = document.querySelectorAll('#inventory-table tbody tr[data-product]');

        inventoryRows.forEach(row => {
            const productName = row.getAttribute('data-product');
            const stockCell = row.querySelector('[data-stock]');
            const currentStock = stockCell ? parseInt(stockCell.getAttribute('data-stock')) || 0 : 0;

            productSummary[productName] = {
                production: currentStock,
                shipment: 0
            };
        });

        // 마감할 내용이 없으면 종료
        if (Object.keys(productSummary).length === 0) {
            showScanResult('등록된 제품이 없습니다.', 'error');
            return;
        }

        // 마감 확인
        const summaryText = Object.entries(productSummary)
            .map(([name, data]) => `${name}: ${data.production}개`)
            .join('\n');

        const confirmed = await showConfirmDialog(
            `${formatDisplayDate(today)} 마감을 진행하시겠습니까?\n\n[마감 내용]\n${summaryText}`
        );

        if (!confirmed) return;

        // Firebase에 마감 기록 저장
        await dailyClosingsRef.child(dateKey).set({
            date: dateKey,
            closedAt: Date.now(),
            products: productSummary
        });

        // 7일 초과 기록 자동 삭제
        await cleanupOldClosings();

        showScanResult(`${formatDisplayDate(today)} 마감이 완료되었습니다.`, 'success');
    } catch (error) {
        console.error('마감 저장 오류:', error);
        showScanResult('마감 저장 중 오류가 발생했습니다.', 'error');
    }
}

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
            console.log(`오래된 마감 기록 삭제: ${key}`);
        } catch (error) {
            console.error(`마감 기록 삭제 오류 (${key}):`, error);
        }
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
            updates[`${product.name}/currentStock`] = 0;
            updates[`${product.name}/updatedAt`] = Date.now();
        });

        await productsRef.update(updates);
        showScanResult('금일 생산현황이 리셋되었습니다.', 'success');
        console.log('금일 생산현황 리셋 완료:', new Date().toLocaleString());
    } catch (error) {
        console.error('리셋 오류:', error);
        showScanResult('리셋 중 오류가 발생했습니다.', 'error');
    }
}

// 리셋 버튼 이벤트 리스너
document.getElementById('btn-reset-today').addEventListener('click', () => resetTodayProduction(false));

// 자정 자동 리셋 타이머 설정
function setupMidnightReset() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // 다음 자정 (00:00:00)

    const msUntilMidnight = midnight.getTime() - now.getTime();

    console.log(`자정 자동 리셋 예정: ${midnight.toLocaleString()} (${Math.round(msUntilMidnight / 60000)}분 후)`);

    setTimeout(() => {
        console.log('자정이 되어 금일 생산현황을 자동 리셋합니다.');
        resetTodayProduction(true); // 확인 없이 자동 리셋
        // 다음 자정을 위해 타이머 재설정
        setupMidnightReset();
    }, msUntilMidnight);
}

// 앱 시작 시 자정 타이머 설정
setupMidnightReset();

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

console.log('우리곡간식품 재고관리 시스템이 시작되었습니다!');
