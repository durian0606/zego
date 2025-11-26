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
const inventoryTbody = document.getElementById('inventory-tbody');
const dailySummaryTbody = document.getElementById('daily-summary-tbody');
const historyTbody = document.getElementById('history-tbody');
const barcodeTbody = document.getElementById('barcode-tbody');
const connectionStatus = document.getElementById('connection-status');
const productForm = document.getElementById('product-form');

// 앱 상태 관리
const AppState = {
    productsData: {},
    barcodesData: {},
    historyData: [],
    isEditingMinStock: false,
    isEditingCurrentStock: false
};

// ============================================
// 유틸리티 함수
// ============================================

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
    updateInventoryTable();
});

// 바코드 목록 실시간 감지
barcodesRef.on('value', (snapshot) => {
    AppState.barcodesData = snapshot.val() || {};
    console.log('Firebase에서 바코드 데이터 업데이트:', Object.keys(AppState.barcodesData).length, '개');
    console.log('바코드 목록:', Object.keys(AppState.barcodesData));
    updateBarcodeTable();
    updateInventoryTable(); // 바코드 수 표시를 위해
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

    inventoryTbody.innerHTML = products.map(product => {
        const minStock = product.minStock || 0; // undefined 방지
        const shortage = minStock - product.currentStock; // 부족한 수량

        let stockStatus, stockText;
        if (shortage > 0) {
            stockStatus = 'stock-low';
            stockText = `${shortage} 부족`;
        } else {
            stockStatus = 'stock-ok';
            stockText = '정상';
        }

        console.log('제품:', product.name, '현재재고:', product.currentStock, '목표재고:', minStock, '부족수량:', shortage);

        return `
            <tr>
                <td><strong>${product.name}</strong></td>
                <td class="stock-number editable-stock" data-product="${product.name}" data-stock="${product.currentStock}" onclick="editCurrentStock(this)" title="클릭하여 수정"><strong>${product.currentStock}</strong> <i data-lucide="edit-2" style="width: 20px; height: 20px; display: inline-block; vertical-align: middle; opacity: 0.6;"></i></td>
                <td class="stock-number editable-stock" data-product="${product.name}" data-minstock="${minStock}" onclick="editMinStock(this)" title="클릭하여 수정"><span class="min-stock-value">${minStock}</span> <i data-lucide="edit-2" style="width: 20px; height: 20px; display: inline-block; vertical-align: middle; opacity: 0.6;"></i></td>
                <td><span class="stock-status ${stockStatus}">${stockText}</span></td>
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

// 히스토리 테이블 업데이트 (어제/오늘만 표시)
function updateHistoryTable() {
    const validHistory = filterValidHistory(AppState.historyData);

    // 어제 00:00:00 타임스탬프 계산
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayTimestamp = yesterday.getTime();

    // 어제와 오늘 데이터만 필터링
    const recentHistory = validHistory.filter(item => {
        return item.timestamp >= yesterdayTimestamp;
    });

    if (recentHistory.length === 0) {
        historyTbody.innerHTML = '<tr><td colspan="4" class="no-data">내역이 없습니다.</td></tr>';
        return;
    }

    historyTbody.innerHTML = recentHistory.map(item => {
        // 시간 형식: 25.11.24 PM 10:41
        const date = new Date(item.timestamp);
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
            productionCell = `<span class="transaction-type transaction-in">${item.quantity}</span>`;
            shipmentCell = '-';
        } else if (item.type === 'OUT') {
            productionCell = '-';
            shipmentCell = `<span class="transaction-type transaction-out">${item.quantity}</span>`;
        } else if (item.type === 'ADJUST') {
            productionCell = '-';
            shipmentCell = '-';
        } else {
            productionCell = '-';
            shipmentCell = '-';
        }

        return `
            <tr>
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

// 금일 생산/출고 현황 테이블 업데이트
function updateDailySummaryTable() {
    const validHistory = filterValidHistory(AppState.historyData);

    // 오늘 날짜 시작 시간 (00:00:00)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    // 오늘 데이터만 필터링 (ADJUST 제외)
    const todayHistory = validHistory.filter(item => {
        return item.timestamp >= todayTimestamp && item.type !== 'ADJUST';
    });

    if (todayHistory.length === 0) {
        dailySummaryTbody.innerHTML = '<tr><td colspan="3" class="no-data">오늘 생산/출고 내역이 없습니다.</td></tr>';
        return;
    }

    // 제품별로 그룹화하여 생산/출고 합계 계산
    const productSummary = {};
    todayHistory.forEach(item => {
        if (!productSummary[item.productName]) {
            productSummary[item.productName] = {
                production: 0,  // 생산 (IN)
                shipment: 0     // 출고 (OUT)
            };
        }

        if (item.type === 'IN') {
            productSummary[item.productName].production += item.quantity;
        } else if (item.type === 'OUT') {
            productSummary[item.productName].shipment += item.quantity;
        }
    });

    // 테이블 렌더링
    dailySummaryTbody.innerHTML = Object.entries(productSummary).map(([productName, summary]) => {
        return `
            <tr>
                <td><strong>${productName}</strong></td>
                <td><span class="transaction-type transaction-in">${summary.production}개</span></td>
                <td><span class="transaction-type transaction-out">${summary.shipment}개</span></td>
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
    const barcodes = filterValidBarcodes(AppState.barcodesData);
    console.log('바코드 데이터:', barcodes);

    if (barcodes.length === 0) {
        barcodeTbody.innerHTML = '<tr><td colspan="4" class="no-data">등록된 바코드가 없습니다.</td></tr>';
        return;
    }

    // 제품별로 그룹화하고 타입별로 정리
    const productGroups = {};
    barcodes.forEach(barcode => {
        if (!productGroups[barcode.productName]) {
            productGroups[barcode.productName] = {
                IN: [],   // 생산
                OUT: [],  // 출고
                VIEW: []  // 조회
            };
        }
        productGroups[barcode.productName][barcode.type].push(barcode);
    });

    let html = '';
    Object.entries(productGroups).forEach(([productName, types]) => {
        // 생산 타입 수량 정리 (수량 내림차순 정렬)
        const inQuantities = types.IN
            .sort((a, b) => b.quantity - a.quantity)
            .map(b => `${b.quantity}개`)
            .join(', ') || '-';

        // 출고 타입 수량 정리 (수량 내림차순 정렬)
        const outQuantities = types.OUT
            .sort((a, b) => b.quantity - a.quantity)
            .map(b => `${b.quantity}개`)
            .join(', ') || '-';

        html += `
            <tr>
                <td class="product-name-cell"><strong>${productName}</strong></td>
                <td>${inQuantities}</td>
                <td>${outQuantities}</td>
                <td>
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

// 제품 수정 함수 (제품명 변경)
async function editProduct(oldProductName) {
    const newProductName = prompt(`새로운 제품명을 입력하세요:`, oldProductName);

    if (!newProductName || newProductName.trim() === '') {
        return; // 취소 또는 빈 입력
    }

    const trimmedName = newProductName.trim();

    // 이름이 변경되지 않은 경우
    if (trimmedName === oldProductName) {
        return;
    }

    // undefined 체크
    if (trimmedName === 'undefined') {
        showScanResult('유효하지 않은 제품명입니다.', 'error');
        return;
    }

    // 중복 체크
    if (AppState.productsData[trimmedName]) {
        showScanResult('이미 존재하는 제품명입니다.', 'error');
        return;
    }

    const confirmed = await showConfirmDialog(`제품명을 "${oldProductName}"에서 "${trimmedName}"으로 변경하시겠습니까?\n관련된 모든 바코드의 제품명도 함께 변경됩니다.`);
    if (!confirmed) return;

    try {
        const oldProduct = AppState.productsData[oldProductName];

        // 1. 새로운 제품명으로 제품 생성
        await productsRef.child(trimmedName).set({
            ...oldProduct,
            name: trimmedName,
            updatedAt: Date.now()
        });

        // 2. 관련된 모든 바코드 업데이트
        const barcodes = filterValidBarcodes(AppState.barcodesData);
        const relatedBarcodes = barcodes.filter(b => b.productName === oldProductName);

        for (const barcode of relatedBarcodes) {
            await barcodesRef.child(barcode.barcode).update({
                productName: trimmedName
            });
        }

        // 3. 기존 제품 삭제
        await productsRef.child(oldProductName).remove();

        showScanResult(`제품명이 "${trimmedName}"으로 변경되었습니다.`, 'success');
    } catch (error) {
        console.error('제품명 변경 오류:', error);
        showScanResult('제품명 변경 중 오류가 발생했습니다.', 'error');
    }
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

// 스캔 결과 표시
function showScanResult(message, type) {
    scanResult.textContent = message;
    scanResult.className = `scan-result ${type}`;
    scanResult.style.display = 'block';
    setTimeout(() => {
        scanResult.style.display = 'none';
        scanResult.textContent = '';
        scanResult.className = 'scan-result';
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
        // Lucide 아이콘 다시 렌더링
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    } else {
        settingsSection.style.display = 'none';
    }
});

btnCloseSettings.addEventListener('click', () => {
    settingsSection.style.display = 'none';
    barcodeInput.focus();
});

// 제품 등록 섹션 토글
const btnToggleRegister = document.getElementById('btn-toggle-register');
const btnCloseRegister = document.getElementById('btn-close-register');
const productRegisterSection = document.getElementById('product-register-section');

btnToggleRegister.addEventListener('click', () => {
    if (productRegisterSection.style.display === 'none') {
        productRegisterSection.style.display = 'block';
        productRegisterSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        productRegisterSection.style.display = 'none';
    }
});

btnCloseRegister.addEventListener('click', () => {
    productRegisterSection.style.display = 'none';
    barcodeInput.focus();
});

// 바코드 관리 섹션 토글
const btnToggleBarcodeMgmt = document.getElementById('btn-toggle-barcode-management');
const barcodeMgmtSection = document.getElementById('barcode-management-section');

btnToggleBarcodeMgmt.addEventListener('click', () => {
    if (barcodeMgmtSection.style.display === 'none') {
        barcodeMgmtSection.style.display = 'block';
        barcodeMgmtSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        // Lucide 아이콘 다시 렌더링
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    } else {
        barcodeMgmtSection.style.display = 'none';
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

    if (!productName || productName === 'undefined') {
        alert('제품명은 필수입니다.');
        return;
    }

    // 제품 중복 확인
    if (findProductByName(productName)) {
        alert('이미 등록된 제품입니다.');
        return;
    }

    // 생산 수량 단위 수집
    const quantitiesIn = [];

    // 생산 프리셋 체크박스
    document.querySelectorAll('.quantity-checkbox-in:checked').forEach(checkbox => {
        quantitiesIn.push(parseInt(checkbox.value));
    });

    // 생산 커스텀 입력
    document.querySelectorAll('.custom-quantity-input-in').forEach(input => {
        const val = parseInt(input.value);
        if (val > 0) {
            quantitiesIn.push(val);
        }
    });

    // 출고 수량 단위 수집
    const quantitiesOut = [];

    // 출고 프리셋 체크박스
    document.querySelectorAll('.quantity-checkbox-out:checked').forEach(checkbox => {
        quantitiesOut.push(parseInt(checkbox.value));
    });

    // 출고 커스텀 입력
    document.querySelectorAll('.custom-quantity-input-out').forEach(input => {
        const val = parseInt(input.value);
        if (val > 0) {
            quantitiesOut.push(val);
        }
    });

    if (quantitiesIn.length === 0 && quantitiesOut.length === 0) {
        alert('생산 또는 출고 수량 중 최소 1개 이상 선택해주세요.');
        return;
    }

    // 중복 제거 및 정렬
    const uniqueQuantitiesIn = [...new Set(quantitiesIn)].sort((a, b) => b - a);
    const uniqueQuantitiesOut = [...new Set(quantitiesOut)].sort((a, b) => b - a);

    try {
        // 제품 생성
        await productsRef.child(productName).set({
            name: productName,
            minStock: 0, // 기본값
            currentStock: 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        // 제품 인덱스 계산
        const products = filterValidProducts(AppState.productsData);
        const productIndex = (products.length + 1).toString().padStart(3, '0');

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

        alert(`제품 "${productName}"이(가) 등록되었습니다!\n${barcodeCount}개의 바코드가 생성되었습니다.`);

        // 폼 초기화
        productForm.reset();

        // 생산 체크박스 모두 체크
        document.querySelectorAll('.quantity-checkbox-in').forEach(cb => cb.checked = true);
        // 생산 추가 입력 필드 초기화
        document.getElementById('custom-quantities-in').innerHTML = `
            <div style="display: flex; gap: 10px; margin-bottom: 5px;">
                <input type="number" class="custom-quantity-input-in" min="1" placeholder="예: 20">
                <button type="button" class="btn-add-quantity" onclick="addCustomQuantityInputIn()">+</button>
            </div>
        `;

        // 출고 체크박스 모두 체크
        document.querySelectorAll('.quantity-checkbox-out').forEach(cb => cb.checked = true);
        // 출고 추가 입력 필드 초기화
        document.getElementById('custom-quantities-out').innerHTML = `
            <div style="display: flex; gap: 10px; margin-bottom: 5px;">
                <input type="number" class="custom-quantity-input-out" min="1" placeholder="예: 20">
                <button type="button" class="btn-add-quantity" onclick="addCustomQuantityInputOut()">+</button>
            </div>
        `;

        // 등록 후 섹션 닫고 바코드 입력으로 포커스
        productRegisterSection.style.display = 'none';
        barcodeInput.focus();
    } catch (error) {
        console.error('제품 등록 오류:', error);
        alert('제품 등록 중 오류가 발생했습니다.');
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
        .barcode-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
        }
        .barcode-item {
            border: 1px solid #ddd;
            padding: 10px;
            text-align: center;
            background: white;
            border-radius: 6px;
        }
        .barcode-title {
            font-size: 0.75em;
            font-weight: 600;
            margin-bottom: 6px;
            color: #333;
            word-break: keep-all;
        }
        .barcode-svg {
            margin: 3px auto;
            max-width: 100%;
            height: auto;
        }

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
            .barcode-grid {
                gap: 6px;
            }
            .barcode-item {
                border: 1px solid #999;
                padding: 6px;
                border-radius: 3px;
                break-inside: avoid;
            }
            .barcode-title {
                font-size: 0.65em;
            }
            .barcode-svg {
                margin: 2px auto;
                max-width: 100%;
                height: auto;
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

    // 실제 등록된 바코드만 사용

    // 생산 바코드 페이지
    html += `
    <div class="page-section">
        <h2>생산 바코드 (IN)</h2>
        <div class="barcode-grid">
`;

    products.forEach(product => {
        const inBarcodes = productBarcodes[product.name]?.IN || [];
        // 수량 내림차순 정렬
        inBarcodes.sort((a, b) => b.quantity - a.quantity);

        inBarcodes.forEach(barcode => {
            html += `
            <div class="barcode-item">
                <div class="barcode-title">${product.name} 생산 + ${barcode.quantity}</div>
                <svg class="barcode-svg" id="barcode-${barcode.barcode}"></svg>
            </div>
            `;
        });
    });

    html += `
        </div>
    </div>
`;

    // 출고 바코드 페이지
    html += `
    <div class="page-section">
        <h2>출고 바코드 (OUT)</h2>
        <div class="barcode-grid">
`;

    products.forEach(product => {
        const outBarcodes = productBarcodes[product.name]?.OUT || [];
        // 수량 내림차순 정렬
        outBarcodes.sort((a, b) => b.quantity - a.quantity);

        outBarcodes.forEach(barcode => {
            html += `
            <div class="barcode-item">
                <div class="barcode-title">${product.name} 출고 - ${barcode.quantity}</div>
                <svg class="barcode-svg" id="barcode-${barcode.barcode}"></svg>
            </div>
            `;
        });
    });

    html += `
        </div>
    </div>
`;

    html += `
    <script>
        // 바코드 생성
        window.onload = function() {
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
