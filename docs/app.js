// Firebase 데이터베이스 참조
const database = firebase.database();
const productsRef = database.ref('products');
const barcodesRef = database.ref('barcodes');
const historyRef = database.ref('history');

// DOM 요소
const barcodeInput = document.getElementById('barcode-input');
const scanResult = document.getElementById('scan-result');
const inventoryTbody = document.getElementById('inventory-tbody');
const historyTbody = document.getElementById('history-tbody');
const barcodeTbody = document.getElementById('barcode-tbody');
const connectionStatus = document.getElementById('connection-status');
const productForm = document.getElementById('product-form');

// 데이터 캐시
let productsData = {};
let barcodesData = {};
let historyData = [];

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
    productsData = snapshot.val() || {};
    updateInventoryTable();
});

// 바코드 목록 실시간 감지
barcodesRef.on('value', (snapshot) => {
    barcodesData = snapshot.val() || {};
    updateBarcodeTable();
    updateInventoryTable(); // 바코드 수 표시를 위해
});

// 히스토리 실시간 감지 (최근 50개만)
historyRef.orderByChild('timestamp').limitToLast(50).on('value', (snapshot) => {
    historyData = [];
    snapshot.forEach((child) => {
        historyData.unshift(child.val()); // 최신순으로
    });
    updateHistoryTable();
});

// 재고 테이블 업데이트
function updateInventoryTable() {
    const products = Object.values(productsData);
    console.log('제품 데이터:', products);

    if (products.length === 0) {
        inventoryTbody.innerHTML = '<tr><td colspan="4" class="no-data">제품이 없습니다.</td></tr>';
        return;
    }

    inventoryTbody.innerHTML = products.map(product => {
        const stockStatus = product.currentStock <= product.minStock ? 'stock-low' : 'stock-ok';
        const stockText = product.currentStock <= product.minStock ? '부족' : '정상';

        console.log('제품:', product.name, '현재재고:', product.currentStock, '목표재고:', product.minStock);

        return `
            <tr>
                <td><strong>${product.name}</strong></td>
                <td class="stock-number"><strong>${product.currentStock}</strong></td>
                <td class="stock-number editable-stock" data-product="${product.name}" onclick="editMinStock(this, '${product.name}', ${product.minStock})" title="클릭하여 수정">${product.minStock} 📝</td>
                <td><span class="stock-status ${stockStatus}">${stockText}</span></td>
            </tr>
        `;
    }).join('');
}

// 목표 재고 수정 함수
function editMinStock(element, productName, currentValue) {
    const newValue = prompt(`"${productName}"의 목표 재고를 입력하세요:`, currentValue);

    if (newValue === null || newValue === '') return;

    const minStock = parseInt(newValue);
    if (isNaN(minStock) || minStock < 0) {
        alert('올바른 숫자를 입력해주세요.');
        return;
    }

    // Firebase에 업데이트
    productsRef.child(productName).update({
        minStock: minStock,
        updatedAt: Date.now()
    }).then(() => {
        showScanResult(`목표 재고가 ${minStock}개로 변경되었습니다.`, 'success');
    }).catch((error) => {
        console.error('목표 재고 업데이트 오류:', error);
        showScanResult('목표 재고 업데이트 중 오류가 발생했습니다.', 'error');
    });
}

// 히스토리 테이블 업데이트
function updateHistoryTable() {
    if (historyData.length === 0) {
        historyTbody.innerHTML = '<tr><td colspan="7" class="no-data">히스토리가 없습니다.</td></tr>';
        return;
    }

    historyTbody.innerHTML = historyData.map(item => {
        const typeClass = item.type === 'IN' ? 'transaction-in' : 'transaction-out';
        const typeText = item.type === 'IN' ? '입고' : '출고';
        const date = new Date(item.timestamp).toLocaleString('ko-KR');

        return `
            <tr>
                <td>${date}</td>
                <td>${item.productName}</td>
                <td>${item.barcode}</td>
                <td><span class="transaction-type ${typeClass}">${typeText}</span></td>
                <td>${item.quantity}</td>
                <td>${item.beforeStock}</td>
                <td>${item.afterStock}</td>
            </tr>
        `;
    }).join('');
}

// 바코드 관리 테이블 업데이트
function updateBarcodeTable() {
    const barcodes = Object.values(barcodesData);
    console.log('바코드 데이터:', barcodes);

    if (barcodes.length === 0) {
        barcodeTbody.innerHTML = '<tr><td colspan="5" class="no-data">등록된 바코드가 없습니다.</td></tr>';
        return;
    }

    barcodeTbody.innerHTML = barcodes.map(barcode => {
        const typeText = barcode.type === 'IN' ? '입고' : barcode.type === 'OUT' ? '출고' : '조회';
        const typeClass = barcode.type === 'IN' ? 'transaction-in' : barcode.type === 'OUT' ? 'transaction-out' : 'transaction-view';
        const quantityText = barcode.type === 'VIEW' ? '-' : `${barcode.quantity}개`;

        return `
            <tr>
                <td>${barcode.barcode}</td>
                <td>${barcode.productName}</td>
                <td><span class="transaction-type ${typeClass}">${typeText}</span></td>
                <td>${quantityText}</td>
                <td><button class="btn-delete" onclick="deleteBarcode('${barcode.barcode}')">삭제</button></td>
            </tr>
        `;
    }).join('');

    console.log('바코드 테이블 업데이트 완료');
}

// 바코드 삭제 함수
async function deleteBarcode(barcodeId) {
    if (!confirm(`바코드 "${barcodeId}"를 삭제하시겠습니까?`)) {
        return;
    }

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
    return productsData[productName];
}

// 바코드 찾기
function findBarcodeInfo(barcode) {
    return barcodesData[barcode];
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

        const typeText = type === 'IN' ? '입고' : '출고';
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

// 타입 선택 시 수량 필드 표시/숨김
const typeSelect = document.getElementById('new-type');
const quantityGroup = document.getElementById('quantity-group');
const quantityInput = document.getElementById('new-quantity');

typeSelect.addEventListener('change', () => {
    if (typeSelect.value === 'VIEW') {
        quantityGroup.style.display = 'none';
        quantityInput.required = false;
    } else {
        quantityGroup.style.display = 'block';
        quantityInput.required = true;
    }
});

// 바코드 등록
productForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const barcode = document.getElementById('new-barcode').value.trim();
    const productName = document.getElementById('new-name').value.trim();
    const type = document.getElementById('new-type').value;
    const quantity = parseInt(document.getElementById('new-quantity').value) || 0;
    const minStockInput = document.getElementById('new-min-stock').value;
    const minStock = minStockInput ? parseInt(minStockInput) : null;

    if (!barcode || !productName) {
        alert('바코드와 제품명은 필수입니다.');
        return;
    }

    if ((type === 'IN' || type === 'OUT') && quantity <= 0) {
        alert('입고/출고 타입은 수량을 1 이상 입력해야 합니다.');
        return;
    }

    // 바코드 중복 확인
    if (findBarcodeInfo(barcode)) {
        alert('이미 등록된 바코드입니다.');
        return;
    }

    try {
        // 제품이 없으면 생성
        const existingProduct = findProductByName(productName);
        if (!existingProduct) {
            await productsRef.child(productName).set({
                name: productName,
                minStock: minStock !== null ? minStock : 0,
                currentStock: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        // 바코드 정보 저장
        await barcodesRef.child(barcode).set({
            barcode: barcode,
            productName: productName,
            type: type,
            quantity: type === 'VIEW' ? 0 : quantity,
            createdAt: Date.now()
        });

        alert('바코드가 등록되었습니다!');
        productForm.reset();
        document.getElementById('new-min-stock').value = '';
        document.getElementById('new-quantity').value = '1';

        // 등록 후 섹션 닫고 바코드 입력으로 포커스
        productRegisterSection.style.display = 'none';
        barcodeInput.focus();
    } catch (error) {
        console.error('바코드 등록 오류:', error);
        alert('바코드 등록 중 오류가 발생했습니다.');
    }
});

// 페이지 로드 시 바코드 입력에 포커스
window.addEventListener('load', () => {
    barcodeInput.focus();
});

// 포커스 항상 유지 (바코드 스캐너 입력 받기 위해)
// 단, 제품 등록 섹션이 열려있을 때는 제외
barcodeInput.addEventListener('blur', () => {
    setTimeout(() => {
        if (productRegisterSection.style.display === 'none') {
            barcodeInput.focus();
        }
    }, 100);
});

// 화면 클릭 시에도 포커스 유지 (제품 등록 섹션이 닫혀있을 때만)
document.addEventListener('click', (e) => {
    if (productRegisterSection.style.display === 'none') {
        barcodeInput.focus();
    }
});

console.log('바코드 재고관리 시스템이 시작되었습니다!');
