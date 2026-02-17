/**
 * 채널 정의 및 컬럼 매핑 (브라우저용)
 * choolgo-watcher/shipping/column-maps.js 및 choolgo-watcher/config/channels.js 를
 * 브라우저 환경용으로 통합 포팅
 */

// ============================================
// A. 컬럼 매핑
// ============================================

const COLUMN_MAPS = {
    iwon: {
        recipientName: 'I',
        phone: 'J',
        postalCode: 'L',
        address: 'M',
        message: 'N',
        productName: 'D',
        quantity: 'E',
        headerCheck: { col: 'I', keyword: '수취인' },
    },
    kakao: {
        recipientName: 'O',
        phone: 'P',
        postalCode: 'T',
        address: 'R',
        message: 'S',
        productName: ['E', 'F'],
        quantity: 'G',
        headerCheck: { col: 'O', keyword: '수령인' },
    },
    paldogam: {
        recipientName: 'C',
        phone: 'G',
        postalCode: 'D',
        address: 'E',
        message: 'F',
        productName: ['J', 'L'],
        quantity: 'N',
        headerCheck: { col: 'C', keyword: '수령인' },
    },
    naver: {
        recipientName: 'A',
        phone: 'B',
        postalCode: null,
        address: 'C',
        message: 'G',
        productName: ['D', 'E'],
        quantity: 'F',
        headerCheck: { col: 'A', keyword: '수취인' },
    },
};

const GENERIC_MAPS = {
    '잇템커머스': {
        recipientName: 'G',
        phone: 'H',
        postalCode: 'J',
        address: 'K',
        message: 'L',
        productName: 'B',
        quantity: 'C',
        skipRows: 3,
    },
    '포앤서치': {
        recipientName: 'G',
        phone: 'H',
        postalCode: 'J',
        address: 'K',
        message: 'L',
        productName: 'B',
        quantity: 'C',
        skipRows: 3,
    },
    '캄므커머스': {
        recipientName: 'G',
        phone: 'H',
        postalCode: 'J',
        address: 'K',
        message: 'L',
        productName: 'B',
        quantity: 'C',
        skipRows: 3,
    },
    '크레이지': {
        recipientName: 'A',
        phone: 'B',
        postalCode: 'C',
        address: 'D',
        message: 'G',
        productName: 'F',
        quantity: 'E',
        headerCheck: { col: 'A', keyword: '받는' },
    },
    'J우리곡간': 'auto-detect',
    '브랜딩리드': 'auto-detect',
};

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
    if (channel === 'iwon') return COLUMN_MAPS.iwon;
    if (channel === 'kakao') return COLUMN_MAPS.kakao;
    if (channel === 'paldogam') return COLUMN_MAPS.paldogam;
    if (channel === 'jiktaebae-naver' || channel === 'paldogam-naver') return COLUMN_MAPS.naver;

    if (channel === 'jiktaebae-generic') {
        for (const [key, map] of Object.entries(GENERIC_MAPS)) {
            if (filename && filename.includes(key)) {
                return map;
            }
        }
        return 'auto-detect';
    }

    return null;
}

function autoDetectColumns(header) {
    const result = {};
    const recipientPrefixes = ['수령자', '수령인', '받는분', '받는사람', '수취인'];

    for (const [field, keywords] of Object.entries(AUTO_DETECT_KEYWORDS)) {
        let bestCol = null;
        let isRecipientCol = false;

        for (const [col, val] of Object.entries(header)) {
            const s = String(val || '').trim().replace(/\s+/g, '');
            if (!keywords.some(kw => s.includes(kw))) continue;

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

// ============================================
// B. 채널 감지
// ============================================

const BROWSER_CHANNELS = [
    { id: 'kakao', name: '카카오', pathMatch: '/카카오/' },
    { id: 'paldogam-naver', name: '팔도감/네이버', pathMatch: '/팔도감/', pathRequire: '/네이버/' },
    { id: 'paldogam', name: '팔도감', pathMatch: '/팔도감/' },
    { id: 'iwon', name: '직택배/아이원', pathMatch: '/직택배/', fileMatch: /아이원|발주서/ },
    { id: 'jiktaebae-naver', name: '직택배/네이버', pathMatch: '/직택배/', fileMatch: /네이버|스마트스토어/ },
    { id: 'jiktaebae-generic', name: '직택배/기타', pathMatch: '/직택배/' },
];

// 파일명만으로 채널 판별 (폴더 정보 없을 때)
const FILENAME_CHANNEL_RULES = [
    { id: 'kakao', name: '카카오', fileMatch: /카카오/ },
    { id: 'paldogam-naver', name: '팔도감/네이버', fileMatch: /팔도감.*네이버|네이버.*팔도감/ },
    { id: 'paldogam', name: '팔도감', fileMatch: /팔도감/ },
    { id: 'iwon', name: '직택배/아이원', fileMatch: /아이원|발주서/ },
    { id: 'jiktaebae-naver', name: '직택배/네이버', fileMatch: /네이버|스마트스토어/ },
];

// 매핑 드롭다운용 채널 목록
const ALL_CHANNEL_NAMES = ['카카오', '팔도감', '네이버', '직택배/아이원', '직택배/기타'];

function detectChannelBrowser(file) {
    const filename = file.name;

    // 임시 파일 무시
    if (filename.startsWith('~$')) return null;

    // 폴더 선택 시: webkitRelativePath 에서 경로 패턴 매칭
    const relativePath = file.webkitRelativePath || '';
    if (relativePath) {
        const normalized = '/' + relativePath.replace(/\\/g, '/');
        for (const ch of BROWSER_CHANNELS) {
            if (!normalized.includes(ch.pathMatch)) continue;
            if (ch.pathRequire && !normalized.includes(ch.pathRequire)) continue;
            if (ch.fileMatch && !ch.fileMatch.test(filename)) continue;
            return ch;
        }
    }

    // 파일명으로 매칭 시도
    for (const rule of FILENAME_CHANNEL_RULES) {
        if (rule.fileMatch.test(filename)) return rule;
    }

    // fallback: auto-detect 시도
    return { id: 'jiktaebae-generic', name: '기타(자동감지)' };
}
