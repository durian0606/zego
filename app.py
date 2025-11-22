from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
import database as db
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
socketio = SocketIO(app, cors_allowed_origins="*")

# 데이터베이스 초기화
db.init_db()

@app.route('/')
def index():
    """메인 페이지"""
    return render_template('index.html')

@app.route('/api/products', methods=['GET'])
def get_products():
    """모든 제품 조회"""
    products = db.get_all_products()
    return jsonify(products)

@app.route('/api/products', methods=['POST'])
def add_product():
    """제품 추가"""
    data = request.json
    barcode = data.get('barcode')
    name = data.get('name')
    description = data.get('description', '')
    min_stock = data.get('min_stock', 0)

    if not barcode or not name:
        return jsonify({'success': False, 'error': '바코드와 제품명은 필수입니다.'}), 400

    result = db.add_product(barcode, name, description, min_stock)

    if result['success']:
        # 모든 클라이언트에게 제품 목록 업데이트 알림
        products = db.get_all_products()
        socketio.emit('products_updated', products)
        return jsonify(result), 201
    else:
        return jsonify(result), 400

@app.route('/api/product/<barcode>', methods=['GET'])
def get_product(barcode):
    """바코드로 제품 조회"""
    product = db.get_product_by_barcode(barcode)
    if product:
        return jsonify(product)
    else:
        return jsonify({'error': '제품을 찾을 수 없습니다.'}), 404

@app.route('/api/stock/in', methods=['POST'])
def stock_in():
    """입고 처리"""
    data = request.json
    barcode = data.get('barcode')
    quantity = data.get('quantity', 1)
    note = data.get('note', '')

    if not barcode:
        return jsonify({'success': False, 'error': '바코드가 필요합니다.'}), 400

    if quantity <= 0:
        return jsonify({'success': False, 'error': '수량은 0보다 커야 합니다.'}), 400

    result = db.update_stock(barcode, quantity, 'IN', note)

    if result['success']:
        # 실시간 업데이트
        products = db.get_all_products()
        history = db.get_inventory_history(50)
        socketio.emit('stock_updated', {
            'products': products,
            'history': history,
            'transaction': result
        })
        return jsonify(result), 200
    else:
        return jsonify(result), 400

@app.route('/api/stock/out', methods=['POST'])
def stock_out():
    """출고 처리"""
    data = request.json
    barcode = data.get('barcode')
    quantity = data.get('quantity', 1)
    note = data.get('note', '')

    if not barcode:
        return jsonify({'success': False, 'error': '바코드가 필요합니다.'}), 400

    if quantity <= 0:
        return jsonify({'success': False, 'error': '수량은 0보다 커야 합니다.'}), 400

    result = db.update_stock(barcode, quantity, 'OUT', note)

    if result['success']:
        # 실시간 업데이트
        products = db.get_all_products()
        history = db.get_inventory_history(50)
        socketio.emit('stock_updated', {
            'products': products,
            'history': history,
            'transaction': result
        })
        return jsonify(result), 200
    else:
        return jsonify(result), 400

@app.route('/api/history', methods=['GET'])
def get_history():
    """재고 변동 히스토리 조회"""
    limit = request.args.get('limit', 50, type=int)
    history = db.get_inventory_history(limit)
    return jsonify(history)

# WebSocket 이벤트 핸들러
@socketio.on('connect')
def handle_connect():
    """클라이언트 연결"""
    print('Client connected')
    # 연결 시 현재 데이터 전송
    products = db.get_all_products()
    history = db.get_inventory_history(50)
    emit('initial_data', {
        'products': products,
        'history': history
    })

@socketio.on('disconnect')
def handle_disconnect():
    """클라이언트 연결 해제"""
    print('Client disconnected')

if __name__ == '__main__':
    # 필요한 디렉토리 생성
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static/css', exist_ok=True)
    os.makedirs('static/js', exist_ok=True)

    print("=" * 50)
    print("바코드 재고관리 시스템 시작!")
    print("=" * 50)
    print("서버 주소: http://localhost:5000")
    print("=" * 50)

    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)
