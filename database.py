import sqlite3
from datetime import datetime
import os

DB_PATH = 'inventory.db'

def get_db_connection():
    """데이터베이스 연결"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """데이터베이스 초기화"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 제품 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            barcode TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            current_stock INTEGER DEFAULT 0,
            min_stock INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 재고 변동 히스토리 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS inventory_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            barcode TEXT NOT NULL,
            transaction_type TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            before_stock INTEGER NOT NULL,
            after_stock INTEGER NOT NULL,
            note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products (id)
        )
    ''')

    conn.commit()
    conn.close()
    print("데이터베이스 초기화 완료!")

def add_product(barcode, name, description='', min_stock=0):
    """제품 추가"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO products (barcode, name, description, min_stock)
            VALUES (?, ?, ?, ?)
        ''', (barcode, name, description, min_stock))
        conn.commit()
        product_id = cursor.lastrowid
        conn.close()
        return {'success': True, 'product_id': product_id}
    except sqlite3.IntegrityError:
        conn.close()
        return {'success': False, 'error': '이미 존재하는 바코드입니다.'}

def get_product_by_barcode(barcode):
    """바코드로 제품 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM products WHERE barcode = ?', (barcode,))
    product = cursor.fetchone()
    conn.close()
    return dict(product) if product else None

def get_all_products():
    """모든 제품 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM products ORDER BY name')
    products = cursor.fetchall()
    conn.close()
    return [dict(row) for row in products]

def update_stock(barcode, quantity, transaction_type, note=''):
    """재고 업데이트 (입고/출고)

    Args:
        barcode: 제품 바코드
        quantity: 수량 (양수)
        transaction_type: 'IN' (입고) 또는 'OUT' (출고)
        note: 메모
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # 제품 조회
    cursor.execute('SELECT * FROM products WHERE barcode = ?', (barcode,))
    product = cursor.fetchone()

    if not product:
        conn.close()
        return {'success': False, 'error': '제품을 찾을 수 없습니다.'}

    product_id = product['id']
    before_stock = product['current_stock']

    # 재고 계산
    if transaction_type == 'IN':
        after_stock = before_stock + quantity
    elif transaction_type == 'OUT':
        after_stock = before_stock - quantity
        if after_stock < 0:
            conn.close()
            return {'success': False, 'error': '재고가 부족합니다.'}
    else:
        conn.close()
        return {'success': False, 'error': '잘못된 거래 유형입니다.'}

    # 제품 재고 업데이트
    cursor.execute('''
        UPDATE products
        SET current_stock = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (after_stock, product_id))

    # 히스토리 기록
    cursor.execute('''
        INSERT INTO inventory_history
        (product_id, barcode, transaction_type, quantity, before_stock, after_stock, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (product_id, barcode, transaction_type, quantity, before_stock, after_stock, note))

    conn.commit()
    conn.close()

    return {
        'success': True,
        'product': {
            'id': product_id,
            'barcode': barcode,
            'name': product['name'],
            'before_stock': before_stock,
            'after_stock': after_stock
        }
    }

def get_inventory_history(limit=50):
    """재고 변동 히스토리 조회"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT h.*, p.name as product_name
        FROM inventory_history h
        JOIN products p ON h.product_id = p.id
        ORDER BY h.created_at DESC
        LIMIT ?
    ''', (limit,))
    history = cursor.fetchall()
    conn.close()
    return [dict(row) for row in history]

if __name__ == '__main__':
    init_db()
