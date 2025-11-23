// Firebase 데이터베이스 참조
const database = firebase.database();
const productsRef = database.ref('products');
const historyRef = database.ref('history');

// DOM 요소
const barcodeInput = document.getElementById('barcode-input');
const scanResult = document.getElementById('scan-result');
const inventoryTbody = document.getElementById('inventory-tbody');
const historyTbody = document.getElementById('history-tbody');
const connectionStatus = document.getElementById('connection-status');
const productForm = document.getElementById('product-form');

// 제품 데이터 캐시
let productsData = {};
let historyData = [];

// 입고/출고 바코드용 임시 저장
let tempQuantity = null;  // 수량
let tempType = null;      // 'IN' 또는 'OUT'

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

    if (products.length === 0) {
        inventoryTbody.innerHTML = '<tr><td colspan="6" class="no-data">제품이 없습니다.</td></tr>';
        return;
    }

    inventoryTbody.innerHTML = products.map(product => {
        const stockStatus = product.currentStock <= product.minStock ? 'stock-low' : 'stock-ok';
        const stockText = product.currentStock <= product.minStock ? '부족' : '정상';

        return `
            <tr>
                <td>${product.barcode}</td>
                <td><strong>${product.name}</strong></td>
                <td>${product.description || '-'}</td>
                <td><strong>${product.currentStock}</strong></td>
                <td>${product.minStock}</td>
                <td><span class="stock-status ${stockStatus}">${stockText}</span></td>
            </tr>
        `;
    }).join('');
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

// 스캔 결과 표시
function showScanResult(message, type) {
    scanResult.textContent = message;
    scanResult.className = `scan-result ${type}`;
    setTimeout(() => {
        scanResult.textContent = '';
        scanResult.className = 'scan-result';
    }, 5000);
}

// 제품 찾기 (바코드로)
function findProductByBarcode(barcode) {
    return Object.values(productsData).find(p => p.barcode === barcode);
}

// 재고 업데이트 함수
async function updateStock(barcode, quantity, type) {
    const product = findProductByBarcode(barcode);

    if (!product) {
        showScanResult('제품을 찾을 수 없습니다. 먼저 제품을 등록하세요.', 'error');
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
    }

    try {
        // 제품 재고 업데이트
        await productsRef.child(product.barcode).update({
            currentStock: afterStock,
            updatedAt: Date.now()
        });

        // 히스토리 추가
        await historyRef.push({
            productName: product.name,
            barcode: product.barcode,
            type: type,
            quantity: quantity,
            beforeStock: beforeStock,
            afterStock: afterStock,
            timestamp: Date.now()
        });

        const typeText = type === 'IN' ? '입고' : '출고';
        showScanResult(`${product.name} ${typeText} 완료! (${beforeStock} → ${afterStock})`, 'success');

        // 입력 초기화
        barcodeInput.value = '';
        barcodeInput.focus();

    } catch (error) {
        console.error('재고 업데이트 오류:', error);
        showScanResult('재고 업데이트 중 오류가 발생했습니다.', 'error');
    }
}

// 바코드 입력 처리 (엔터키)
barcodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const barcode = barcodeInput.value.trim().toUpperCase();

        // IN/OUT 바코드 패턴 감지
        const inPattern = /^IN(\d+)$/;   // IN80, IN10, IN1
        const outPattern = /^OUT(\d+)$/; // OUT80, OUT10, OUT1

        const inMatch = barcode.match(inPattern);
        const outMatch = barcode.match(outPattern);

        if (inMatch) {
            // 입고 바코드 스캔
            tempQuantity = parseInt(inMatch[1]);
            tempType = 'IN';
            showScanResult(`입고 모드: ${tempQuantity}개`, 'success');
            barcodeInput.value = '';
            barcodeInput.focus();
        } else if (outMatch) {
            // 출고 바코드 스캔
            tempQuantity = parseInt(outMatch[1]);
            tempType = 'OUT';
            showScanResult(`출고 모드: ${tempQuantity}개`, 'success');
            barcodeInput.value = '';
            barcodeInput.focus();
        } else {
            // 일반 제품 바코드
            if (tempType && tempQuantity) {
                // 입고/출고 모드가 설정되어 있으면 자동 처리
                updateStock(barcode, tempQuantity, tempType);
                // 초기화
                tempQuantity = null;
                tempType = null;
            } else {
                // 기본: 제품 정보만 표시
                const product = findProductByBarcode(barcode);
                if (product) {
                    showScanResult(`${product.name} - 현재 재고: ${product.currentStock}개`, 'success');
                } else {
                    showScanResult('제품을 찾을 수 없습니다. 먼저 제품을 등록하세요.', 'error');
                }
                barcodeInput.value = '';
                barcodeInput.focus();
            }
        }
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

// 제품 등록
productForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const barcode = document.getElementById('new-barcode').value.trim();
    const name = document.getElementById('new-name').value.trim();
    const description = document.getElementById('new-description').value.trim();
    const minStock = parseInt(document.getElementById('new-min-stock').value);

    if (!barcode || !name) {
        alert('바코드와 제품명은 필수입니다.');
        return;
    }

    // 중복 확인
    if (findProductByBarcode(barcode)) {
        alert('이미 등록된 바코드입니다.');
        return;
    }

    try {
        await productsRef.child(barcode).set({
            barcode: barcode,
            name: name,
            description: description,
            minStock: minStock,
            currentStock: 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        alert('제품이 등록되었습니다!');
        productForm.reset();
        document.getElementById('new-min-stock').value = '0';

        // 등록 후 섹션 닫고 바코드 입력으로 포커스
        productRegisterSection.style.display = 'none';
        barcodeInput.focus();
    } catch (error) {
        console.error('제품 등록 오류:', error);
        alert('제품 등록 중 오류가 발생했습니다.');
    }
});

// 페이지 로드 시 바코드 입력에 포커스
window.addEventListener('load', () => {
    barcodeInput.focus();
});

console.log('바코드 재고관리 시스템이 시작되었습니다!');
