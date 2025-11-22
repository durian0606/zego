// Socket.IO 연결
const socket = io();

// DOM 요소
const barcodeInput = document.getElementById('barcode-input');
const quantityInput = document.getElementById('quantity');
const btnStockIn = document.getElementById('btn-stock-in');
const btnStockOut = document.getElementById('btn-stock-out');
const scanResult = document.getElementById('scan-result');
const inventoryTbody = document.getElementById('inventory-tbody');
const historyTbody = document.getElementById('history-tbody');
const connectionStatus = document.getElementById('connection-status');
const productForm = document.getElementById('product-form');

// 연결 상태 관리
socket.on('connect', () => {
    console.log('서버에 연결되었습니다.');
    connectionStatus.textContent = '연결됨';
    connectionStatus.className = 'status-badge connected';
});

socket.on('disconnect', () => {
    console.log('서버 연결이 끊어졌습니다.');
    connectionStatus.textContent = '연결 끊김';
    connectionStatus.className = 'status-badge disconnected';
});

// 초기 데이터 수신
socket.on('initial_data', (data) => {
    console.log('초기 데이터 수신:', data);
    updateInventoryTable(data.products);
    updateHistoryTable(data.history);
});

// 재고 업데이트 수신
socket.on('stock_updated', (data) => {
    console.log('재고 업데이트:', data);
    updateInventoryTable(data.products);
    updateHistoryTable(data.history);

    // 알림 표시
    const product = data.transaction.product;
    const type = data.transaction.product.before_stock < data.transaction.product.after_stock ? '입고' : '출고';
    showScanResult(`${product.name} ${type} 완료! (${product.before_stock} → ${product.after_stock})`, 'success');
});

// 제품 목록 업데이트 수신
socket.on('products_updated', (products) => {
    console.log('제품 목록 업데이트:', products);
    updateInventoryTable(products);
});

// 재고 테이블 업데이트
function updateInventoryTable(products) {
    if (!products || products.length === 0) {
        inventoryTbody.innerHTML = '<tr><td colspan="6" class="no-data">제품이 없습니다.</td></tr>';
        return;
    }

    inventoryTbody.innerHTML = products.map(product => {
        const stockStatus = product.current_stock <= product.min_stock ? 'stock-low' : 'stock-ok';
        const stockText = product.current_stock <= product.min_stock ? '부족' : '정상';

        return `
            <tr>
                <td>${product.barcode}</td>
                <td><strong>${product.name}</strong></td>
                <td>${product.description || '-'}</td>
                <td><strong>${product.current_stock}</strong></td>
                <td>${product.min_stock}</td>
                <td><span class="stock-status ${stockStatus}">${stockText}</span></td>
            </tr>
        `;
    }).join('');
}

// 히스토리 테이블 업데이트
function updateHistoryTable(history) {
    if (!history || history.length === 0) {
        historyTbody.innerHTML = '<tr><td colspan="8" class="no-data">히스토리가 없습니다.</td></tr>';
        return;
    }

    historyTbody.innerHTML = history.map(item => {
        const typeClass = item.transaction_type === 'IN' ? 'transaction-in' : 'transaction-out';
        const typeText = item.transaction_type === 'IN' ? '입고' : '출고';
        const date = new Date(item.created_at).toLocaleString('ko-KR');

        return `
            <tr>
                <td>${date}</td>
                <td>${item.product_name}</td>
                <td>${item.barcode}</td>
                <td><span class="transaction-type ${typeClass}">${typeText}</span></td>
                <td>${item.quantity}</td>
                <td>${item.before_stock}</td>
                <td>${item.after_stock}</td>
                <td>${item.note || '-'}</td>
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

// 입고 처리
btnStockIn.addEventListener('click', async () => {
    const barcode = barcodeInput.value.trim();
    const quantity = parseInt(quantityInput.value);

    if (!barcode) {
        showScanResult('바코드를 입력하세요.', 'error');
        return;
    }

    if (quantity <= 0) {
        showScanResult('수량은 0보다 커야 합니다.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/stock/in', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ barcode, quantity }),
        });

        const data = await response.json();

        if (data.success) {
            barcodeInput.value = '';
            quantityInput.value = '1';
            barcodeInput.focus();
        } else {
            showScanResult(data.error, 'error');
        }
    } catch (error) {
        console.error('입고 처리 오류:', error);
        showScanResult('입고 처리 중 오류가 발생했습니다.', 'error');
    }
});

// 출고 처리
btnStockOut.addEventListener('click', async () => {
    const barcode = barcodeInput.value.trim();
    const quantity = parseInt(quantityInput.value);

    if (!barcode) {
        showScanResult('바코드를 입력하세요.', 'error');
        return;
    }

    if (quantity <= 0) {
        showScanResult('수량은 0보다 커야 합니다.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/stock/out', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ barcode, quantity }),
        });

        const data = await response.json();

        if (data.success) {
            barcodeInput.value = '';
            quantityInput.value = '1';
            barcodeInput.focus();
        } else {
            showScanResult(data.error, 'error');
        }
    } catch (error) {
        console.error('출고 처리 오류:', error);
        showScanResult('출고 처리 중 오류가 발생했습니다.', 'error');
    }
});

// 엔터키로 입고 처리
barcodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        btnStockIn.click();
    }
});

// 제품 등록
productForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const barcode = document.getElementById('new-barcode').value.trim();
    const name = document.getElementById('new-name').value.trim();
    const description = document.getElementById('new-description').value.trim();
    const min_stock = parseInt(document.getElementById('new-min-stock').value);

    if (!barcode || !name) {
        alert('바코드와 제품명은 필수입니다.');
        return;
    }

    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ barcode, name, description, min_stock }),
        });

        const data = await response.json();

        if (data.success) {
            alert('제품이 등록되었습니다!');
            productForm.reset();
            document.getElementById('new-min-stock').value = '0';
        } else {
            alert('제품 등록 실패: ' + data.error);
        }
    } catch (error) {
        console.error('제품 등록 오류:', error);
        alert('제품 등록 중 오류가 발생했습니다.');
    }
});

// 페이지 로드 시 바코드 입력에 포커스
window.addEventListener('load', () => {
    barcodeInput.focus();
});
