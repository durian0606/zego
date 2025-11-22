#!/usr/bin/env python3
"""
샘플 제품 데이터를 데이터베이스에 추가하는 스크립트
"""

import database as db

# 데이터베이스 초기화
db.init_db()

# 샘플 제품 데이터
sample_products = [
    {
        'barcode': '8801234567890',
        'name': '노트북',
        'description': 'LG 그램 14인치',
        'min_stock': 5
    },
    {
        'barcode': '8801234567891',
        'name': '마우스',
        'description': '로지텍 무선 마우스',
        'min_stock': 10
    },
    {
        'barcode': '8801234567892',
        'name': '키보드',
        'description': '기계식 키보드',
        'min_stock': 8
    },
    {
        'barcode': '8801234567893',
        'name': '모니터',
        'description': '27인치 4K 모니터',
        'min_stock': 3
    },
    {
        'barcode': '8801234567894',
        'name': 'USB 케이블',
        'description': 'USB-C to USB-C 1m',
        'min_stock': 20
    },
    {
        'barcode': '8801234567895',
        'name': '마우스 패드',
        'description': '게이밍 마우스 패드',
        'min_stock': 15
    },
    {
        'barcode': '8801234567896',
        'name': '웹캠',
        'description': 'Full HD 웹캠',
        'min_stock': 5
    },
    {
        'barcode': '8801234567897',
        'name': '헤드셋',
        'description': '노이즈 캔슬링 헤드셋',
        'min_stock': 7
    },
    {
        'barcode': '8801234567898',
        'name': 'USB 허브',
        'description': '7포트 USB 허브',
        'min_stock': 10
    },
    {
        'barcode': '8801234567899',
        'name': '노트북 거치대',
        'description': '알루미늄 노트북 거치대',
        'min_stock': 8
    }
]

print("=" * 50)
print("샘플 데이터 추가 시작")
print("=" * 50)

success_count = 0
fail_count = 0

for product in sample_products:
    result = db.add_product(
        product['barcode'],
        product['name'],
        product['description'],
        product['min_stock']
    )

    if result['success']:
        print(f"✓ {product['name']} 추가 완료 (바코드: {product['barcode']})")
        success_count += 1
    else:
        print(f"✗ {product['name']} 추가 실패: {result['error']}")
        fail_count += 1

print("=" * 50)
print(f"완료! 성공: {success_count}, 실패: {fail_count}")
print("=" * 50)

# 샘플 재고 추가 (일부 제품에 초기 재고 추가)
print("\n샘플 재고 추가 중...")

sample_stocks = [
    ('8801234567890', 10, 'IN', '초기 재고'),
    ('8801234567891', 25, 'IN', '초기 재고'),
    ('8801234567892', 15, 'IN', '초기 재고'),
    ('8801234567893', 5, 'IN', '초기 재고'),
    ('8801234567894', 50, 'IN', '초기 재고'),
]

for barcode, quantity, trans_type, note in sample_stocks:
    result = db.update_stock(barcode, quantity, trans_type, note)
    if result['success']:
        product = result['product']
        print(f"✓ {product['name']}: {quantity}개 입고 완료")
    else:
        print(f"✗ 재고 추가 실패: {result['error']}")

print("\n모든 샘플 데이터 추가 완료!")
print("이제 'python3 app.py'를 실행하여 서버를 시작하세요.")
