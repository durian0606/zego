// Firebase 데이터베이스 참조
const database = firebase.database();
const productsRef = database.ref('products');
const barcodesRef = database.ref('barcodes');
const historyRef = database.ref('history');

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
const dailySummaryTbody = document.getElementById('daily-summary-tbody');
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
    isEditingMinStock: false,
    isEditingCurrentStock: false,
    editingProduct: null  // 수정 중인 제품명 (null이면 신규 등록 모드)
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
    updateInventoryTable();
    updateDailySummaryTable();
    updateHistoryTable();
    updateBarcodeTable();
});

// 바코드 목록 실시간 감지
barcodesRef.on('value', (snapshot) => {
    AppState.barcodesData = snapshot.val() || {};
    console.log('Firebase에서 바코드 데이터 업데이트:', Object.keys(AppState.barcodesData).length, '개');
    console.log('바코드 목록:', Object.keys(AppState.barcodesData));
    updateBarcodeTable();
    updateInventoryTable();
    updateDailySummaryTable();
});

// 히스토리 실시간 감지 (최근 50개만)
historyRef.orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
    AppState.historyData = [];
    snapshot.forEach((child) => {
        AppState.historyData.unshift(child.val()); // 최신순으로
    });
    updateHistoryTable();
    updateDailySummaryTable();
});

// 재고 테이블 업데이트
function updateInventoryTable() {
    const products = filterValidProducts(AppState.productsData);
    console.log('제품 데이터:', products);

    if (products.length === 0) {
        inventoryTbody.innerHTML = '<tr><td colspan="4" class="no-data">제품이 없습니다.</td></tr>';
        return;
    }

    // 정렬: 부족한 수량이 많은 순서대로, 목표 재고가 0인 항목은 맨 아래
    const sortedProducts = products.sort((a, b) => {
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
            <tr class="${colorClass}">
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

    // input 필드 생성
    const input = document.createElement('input');
    input.type = 'number';
    input.value = currentValue;
    input.min = '0';
    input.className = 'inline-edit-input';
    input.style.cssText = 'width: 80px; padding: 5px; font-size: 1.5em; text-align: center; border: 2px solid #667eea;';

    // 전체 내용 교체
    element.innerHTML = '';
    element.appendChild(input);

    // 포커스 및 전체 선택
    setTimeout(() => {
        input.focus();
        input.select();
    }, 0);

    // 취소 함수
    const cancelEdit = () => {
        element.innerHTML = originalContent;
        AppState.isEditingMinStock = false;
        barcodeInput.focus();
    };

    // 저장 함수
    const saveValue = async () => {
        const newValue = input.value.trim();

        if (newValue === '') {
            cancelEdit();
            return;
        }

        const minStock = parseInt(newValue);
        if (isNaN(minStock) || minStock < 0) {
            showScanResult('올바른 숫자를 입력해주세요.', 'error');
            cancelEdit();
            return;
        }

        // 값이 변경되지 않았으면 그냥 취소
        if (minStock === currentValue) {
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
    };

    // 저장 중 플래그
    let isSaving = false;

    const saveValueWrapped = async () => {
        isSaving = true;
        await saveValue();
        isSaving = false;
    };

    // 엔터 키: 저장, ESC: 취소
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            saveValueWrapped();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelEdit();
        }
    });

    // 포커스 잃을 때: 저장 중이 아니면 취소
    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (AppState.isEditingMinStock && !isSaving) {
                cancelEdit();
            }
        }, 100);
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

    // input 필드 생성
    const input = document.createElement('input');
    input.type = 'number';
    input.value = currentValue;
    input.min = '0';
    input.className = 'inline-edit-input';
    input.style.cssText = 'width: 100px; padding: 5px; font-size: 2em; text-align: center; border: 2px solid #667eea;';

    // 전체 내용 교체
    element.innerHTML = '';
    element.appendChild(input);

    // 포커스 및 전체 선택
    setTimeout(() => {
        input.focus();
        input.select();
    }, 0);

    // 취소 함수
    const cancelEdit = () => {
        element.innerHTML = originalContent;
        AppState.isEditingCurrentStock = false;
        barcodeInput.focus();
    };

    // 저장 함수
    const saveValue = async () => {
        const newValue = input.value.trim();

        if (newValue === '') {
            cancelEdit();
            return;
        }

        const newStock = parseInt(newValue);
        if (isNaN(newStock) || newStock < 0) {
            showScanResult('올바른 숫자를 입력해주세요.', 'error');
            cancelEdit();
            return;
        }

        // 값이 변경되지 않았으면 그냥 취소
        if (newStock === currentValue) {
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
            barcodeInput.focus();
        } catch (error) {
            console.error('현재 재고 업데이트 오류:', error);
            showScanResult('현재 재고 업데이트 중 오류가 발생했습니다.', 'error');
            element.innerHTML = originalContent;
            AppState.isEditingCurrentStock = false;
        }
    };

    // 저장 중 플래그
    let isSaving = false;

    const saveValueWrapped = async () => {
        isSaving = true;
        await saveValue();
        isSaving = false;
    };

    // 엔터 키: 저장, ESC: 취소
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            saveValueWrapped();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelEdit();
        }
    });

    // 포커스 잃을 때: 저장 중이 아니면 취소
    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (AppState.isEditingCurrentStock && !isSaving) {
                cancelEdit();
            }
        }, 100);
    });
}

// 히스토리 테이블 업데이트 (어제/오늘만 표시, 제품별로 합치기)
function updateHistoryTable() {
    const validHistory = filterValidHistory(AppState.historyData);
    const validProducts = filterValidProducts(AppState.productsData);
    const validProductNames = new Set(validProducts.map(p => p.name));

    // 어제 00:00:00 타임스탬프 계산
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayTimestamp = yesterday.getTime();

    // 어제와 오늘 데이터만 필터링 (ADJUST 제외, 삭제된 제품 제외)
    const recentHistory = validHistory.filter(item => {
        return item.timestamp >= yesterdayTimestamp &&
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

        // 생산/출고 컬럼 분리
        let productionCell, shipmentCell;
        if (item.type === 'IN') {
            productionCell = `<span class="transaction-type transaction-in">${item.totalQuantity}</span>`;
            shipmentCell = '-';
        } else if (item.type === 'OUT') {
            productionCell = '-';
            shipmentCell = `<span class="transaction-type transaction-out">${item.totalQuantity}</span>`;
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
}

// 생산/출고 현황 테이블 업데이트 (어제/오늘)
function updateDailySummaryTable() {
    const validHistory = filterValidHistory(AppState.historyData);
    const validProducts = filterValidProducts(AppState.productsData);
    const validProductNames = new Set(validProducts.map(p => p.name));

    // 오늘과 어제 날짜 계산
    const today = new Date();
    const todayStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getMonth() + 1}월 ${yesterday.getDate()}일`;

    // 제목 업데이트
    document.getElementById('daily-summary-title').textContent =
        `생산/출고 현황 (어제: ${yesterdayStr} / 오늘: ${todayStr})`;

    // 오늘 00:00:00
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    // 어제 00:00:00
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayTimestamp = yesterday.getTime();

    // 어제와 오늘 데이터 필터링
    const recentHistory = validHistory.filter(item => {
        return item.timestamp >= yesterdayTimestamp &&
               item.type !== 'ADJUST' &&
               validProductNames.has(item.productName);
    });

    if (recentHistory.length === 0) {
        dailySummaryTbody.innerHTML = '<tr><td colspan="5" class="no-data">생산/출고 내역이 없습니다.</td></tr>';
        return;
    }

    // 제품별로 그룹화 (어제/오늘 구분)
    const productSummary = {};
    recentHistory.forEach(item => {
        if (!productSummary[item.productName]) {
            productSummary[item.productName] = {
                yesterdayProduction: 0,
                yesterdayShipment: 0,
                todayProduction: 0,
                todayShipment: 0
            };
        }

        const isToday = item.timestamp >= todayTimestamp;

        if (item.type === 'IN') {
            if (isToday) {
                productSummary[item.productName].todayProduction += item.quantity;
            } else {
                productSummary[item.productName].yesterdayProduction += item.quantity;
            }
        } else if (item.type === 'OUT') {
            if (isToday) {
                productSummary[item.productName].todayShipment += item.quantity;
            } else {
                productSummary[item.productName].yesterdayShipment += item.quantity;
            }
        }
    });

    // 테이블 렌더링
    dailySummaryTbody.innerHTML = Object.entries(productSummary).map(([productName, summary]) => {
        const colorIndex = getProductColorIndex(productName) + 1;
        const colorClass = `product-color-${colorIndex}`;

        return `
            <tr class="${colorClass}">
                <td><strong>${productName}</strong></td>
                <td>${summary.yesterdayProduction > 0 ? `<span class="transaction-type transaction-in">${summary.yesterdayProduction}개</span>` : '-'}</td>
                <td>${summary.yesterdayShipment > 0 ? `<span class="transaction-type transaction-out">${summary.yesterdayShipment}개</span>` : '-'}</td>
                <td>${summary.todayProduction > 0 ? `<span class="transaction-type transaction-in">${summary.todayProduction}개</span>` : '-'}</td>
                <td>${summary.todayShipment > 0 ? `<span class="transaction-type transaction-out">${summary.todayShipment}개</span>` : '-'}</td>
            </tr>
        `;
    }).join('');

    // Lucide 아이콘 다시 렌더링
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
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

// 생산 추가 수량 입력 필드 추가
function addCustomQuantityInputIn() {
    const container = document.getElementById('custom-quantities-in');
    const newInput = document.createElement('div');
    newInput.style.cssText = 'display: flex; gap: 10px; margin-bottom: 5px;';
    newInput.innerHTML = `
        <input type="number" class="custom-quantity-input-in" min="1" placeholder="예: 20">
        <button type="button" class="btn-remove-quantity" onclick="this.parentElement.remove()">-</button>
    `;
    container.appendChild(newInput);
}

// 출고 추가 수량 입력 필드 추가
function addCustomQuantityInputOut() {
    const container = document.getElementById('custom-quantities-out');
    const newInput = document.createElement('div');
    newInput.style.cssText = 'display: flex; gap: 10px; margin-bottom: 5px;';
    newInput.innerHTML = `
        <input type="number" class="custom-quantity-input-out" min="1" placeholder="예: 20">
        <button type="button" class="btn-remove-quantity" onclick="this.parentElement.remove()">-</button>
    `;
    container.appendChild(newInput);
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

        // 제품 생성 또는 업데이트
        const existingProduct = isEditMode ? AppState.productsData[oldProductName] : null;
        await productsRef.child(productName).set({
            name: productName,
            minStock: existingProduct ? existingProduct.minStock : 0,
            currentStock: existingProduct ? existingProduct.currentStock : 0,
            createdAt: existingProduct ? existingProduct.createdAt : Date.now(),
            updatedAt: Date.now()
        });

        // 제품 인덱스 계산
        const products = filterValidProducts(AppState.productsData);
        // 수정 모드인 경우 기존 인덱스 찾기, 신규 등록인 경우 새 인덱스 부여
        let productIndex;
        if (isEditMode) {
            // 기존 바코드에서 인덱스 추출
            const oldBarcodes = filterValidBarcodes(AppState.barcodesData);
            const oldBarcode = oldBarcodes.find(b => b.productName === oldProductName || b.productName === productName);
            if (oldBarcode && oldBarcode.barcode.startsWith('P')) {
                productIndex = oldBarcode.barcode.substring(1, 4); // P001 -> 001
            } else {
                productIndex = (products.length).toString().padStart(3, '0');
            }
        } else {
            productIndex = (products.length + 1).toString().padStart(3, '0');
        }

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

    // 제품명을 정렬하여 색상 매핑 생성 (충돌 방지)
    const sortedProducts = products.map(p => p.name).sort();
    const productColorMap = {};
    sortedProducts.forEach((name, index) => {
        productColorMap[name] = index % 20;
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
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
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
                grid-template-columns: repeat(4, 1fr);
                gap: 15px;
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
            size: A4 portrait;
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
            !AppState.isEditingCurrentStock) {
            barcodeInput.focus();
        }
    }, 100);
});

// 화면 클릭 시에도 포커스 유지 (제품 등록/설정 섹션이 닫혀있고 편집 중이 아닐 때만)
document.addEventListener('click', (e) => {
    if (productRegisterSection.style.display === 'none' &&
        settingsSection.style.display === 'none' &&
        !AppState.isEditingMinStock &&
        !AppState.isEditingCurrentStock) {
        barcodeInput.focus();
    }
});

console.log('우리곡간식품 재고관리 시스템이 시작되었습니다!');
