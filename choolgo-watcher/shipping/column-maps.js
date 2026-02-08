// 채널별 컬럼 매핑 설정
// 각 채널의 원본 엑셀 컬럼 → 대한통운 택배양식 컬럼 매핑
//
// 택배양식 출력 컬럼:
// 받는분성명 | 받는분전화번호 | 받는분우편번호 | 받는분주소(전체, 분할) |
// 배송메세지1 | 품목명 | 내품수량 | 운송장 | 택배사

const COLUMN_MAPS = {
    // 직택배/아이원 발주서
    iwon: {
        recipientName: 'I',    // 수취인명
        phone: 'J',
        postalCode: 'L',
        address: 'M',
        message: 'N',
        productName: 'D',      // 상품명
        quantity: 'E',
        headerCheck: { col: 'I', keyword: '수취인' },
    },

    // 카카오 주문서
    kakao: {
        recipientName: 'O',    // 수령인명
        phone: 'P',
        postalCode: 'T',
        address: 'R',
        message: 'S',
        productName: ['E', 'F'], // 상품 + 옵션 결합
        quantity: 'G',
        headerCheck: { col: 'O', keyword: '수령인' },
    },

    // 팔도감 주문서
    paldogam: {
        recipientName: 'C',    // 수령인
        phone: 'G',
        postalCode: 'D',
        address: 'E',
        message: 'F',
        productName: ['J', 'L'], // 상품명 + 옵션명
        quantity: 'N',
        headerCheck: { col: 'C', keyword: '수령인' },
    },

    // 네이버 (팔도감/직택배 공용)
    // 네이버는 우편번호가 없고 통합배송지 컬럼 사용
    'naver': {
        recipientName: 'A',    // 수취인명
        phone: 'B',
        postalCode: null,      // 우편번호 없음
        address: 'C',          // 통합배송지
        message: 'G',
        productName: ['D', 'E'], // 상품명 + 옵션정보
        quantity: 'F',
        headerCheck: { col: 'A', keyword: '수취인' },
    },
};

// 제네릭 채널은 파일명으로 세부 구분
const GENERIC_MAPS = {
    '잇템커머스': {
        recipientName: 'M',    // 수령인
        phone: 'O',            // 수령인연락처1
        postalCode: 'P',
        address: 'Q',
        message: 'R',
        productName: ['D', 'E'], // 상품명 + 옵션
        quantity: 'I',
        headerCheck: { col: 'M', keyword: '수령인' },
    },

    '포앤서치': {
        recipientName: 'M',    // 수령인
        phone: 'O',            // 수령인연락처1
        postalCode: 'P',
        address: 'Q',
        message: 'R',
        productName: ['D', 'E'], // 상품명 + 옵션
        quantity: 'I',
        headerCheck: { col: 'M', keyword: '수령인' },
    },

    '캄므커머스': {
        recipientName: 'M',    // 수령인
        phone: 'O',            // 수령인연락처1
        postalCode: 'P',
        address: 'Q',
        message: 'R',
        productName: ['D', 'E'], // 상품명 + 옵션
        quantity: 'I',
        headerCheck: { col: 'M', keyword: '수령인' },
    },

    '크레이지': {
        recipientName: 'A',    // 받는사람
        phone: 'B',
        postalCode: 'C',
        address: 'D',
        message: 'G',
        productName: 'F',
        quantity: 'E',
        headerCheck: { col: 'A', keyword: '받는' },
    },

    // J우리곡간 (두브로 등) - 자동 탐지
    'J우리곡간': 'auto-detect',

    // 브랜딩리드 - 자동 탐지
    '브랜딩리드': 'auto-detect',
};

// 자동 탐지용 키워드
const AUTO_DETECT_KEYWORDS = {
    recipientName: ['받는분', '받는사람', '수취인', '수령인', '수령자', '성명'],
    phone: ['전화', '연락처', '핸드폰', '휴대폰', 'HP'],
    postalCode: ['우편번호', '우편', 'zipcode'],
    address: ['주소', '배송지', '수령지'],
    message: ['메세지', '메모', '요청사항', '배송메세지'],
    productName: ['상품명', '품목명', '품목'],
    quantity: ['수량', '내품수량'],
};

function getColumnMap(channel, filename) {
    // 일반 채널 매핑
    if (channel === 'iwon') return COLUMN_MAPS.iwon;
    if (channel === 'kakao') return COLUMN_MAPS.kakao;
    if (channel === 'paldogam') return COLUMN_MAPS.paldogam;
    if (channel === 'jiktaebae-naver' || channel === 'paldogam-naver') return COLUMN_MAPS.naver;

    // 제네릭 채널 → 파일명으로 세부 구분
    if (channel === 'jiktaebae-generic') {
        for (const [key, map] of Object.entries(GENERIC_MAPS)) {
            if (filename && filename.includes(key)) {
                return map; // 'auto-detect' 또는 매핑 객체
            }
        }
        return 'auto-detect';
    }

    return null;
}

function autoDetectColumns(header) {
    const result = {};

    // 수령자/받는분 관련 컬럼 우선 탐지 (주문자 vs 수령자 구분)
    const recipientPrefixes = ['수령자', '수령인', '받는분', '받는사람', '수취인'];

    for (const [field, keywords] of Object.entries(AUTO_DETECT_KEYWORDS)) {
        let bestCol = null;
        let isRecipientCol = false;

        for (const [col, val] of Object.entries(header)) {
            const s = String(val || '').trim();
            if (!keywords.some(kw => s.includes(kw))) continue;

            // 수령자 관련 컬럼이면 우선 선택
            const isRecipient = recipientPrefixes.some(p => s.includes(p));
            if (!bestCol || (isRecipient && !isRecipientCol)) {
                bestCol = col;
                isRecipientCol = isRecipient;
            }
        }

        if (bestCol) {
            result[field] = bestCol;
        }
    }

    return result.recipientName ? result : null;
}

module.exports = { COLUMN_MAPS, GENERIC_MAPS, getColumnMap, autoDetectColumns };
