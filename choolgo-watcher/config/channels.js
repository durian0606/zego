const iwonParser = require('../parsers/iwon');
const naverParser = require('../parsers/naver');
const kakaoParser = require('../parsers/kakao');
const paldogamParser = require('../parsers/paldogam');
const genericParser = require('../parsers/generic');

// 채널 정의: 경로 매칭 → 파일명 매칭 → 파서/한글명
// 순서가 중요 — 먼저 매칭되는 규칙이 우선
const CHANNELS = [
    // 카카오
    {
        id: 'kakao',
        name: '카카오',
        pathMatch: '/카카오/',
        parser: kakaoParser,
    },
    // 팔도감/네이버
    {
        id: 'paldogam-naver',
        name: '팔도감/네이버',
        pathMatch: '/팔도감/',
        pathRequire: '/네이버/',
        parser: naverParser,
    },
    // 팔도감
    {
        id: 'paldogam',
        name: '팔도감',
        pathMatch: '/팔도감/',
        parser: paldogamParser,
    },
    // 직택배/아이원
    {
        id: 'iwon',
        name: '직택배/아이원',
        pathMatch: '/직택배/',
        fileMatch: /아이원|발주서/,
        parser: iwonParser,
    },
    // 직택배/네이버
    {
        id: 'jiktaebae-naver',
        name: '직택배/네이버',
        pathMatch: '/직택배/',
        fileMatch: /네이버|스마트스토어/,
        parser: naverParser,
    },
    // 직택배/기타 (J우리곡간, 크레이지, 잇템, 브랜딩리드, 그 외 모든 xlsx)
    {
        id: 'jiktaebae-generic',
        name: '직택배/기타',
        pathMatch: '/직택배/',
        parser: genericParser,
    },
];

/**
 * 파일 경로로 채널 판별
 * @returns {{ id, name, parser }} 또는 null
 */
function detectChannel(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    const filename = require('path').basename(filePath);

    // 엑셀 임시 파일 무시
    if (filename.startsWith('~$')) return null;

    for (const ch of CHANNELS) {
        // 경로 매칭
        if (!normalized.includes(ch.pathMatch)) continue;

        // 추가 경로 조건 (예: 팔도감/네이버는 '/네이버/' 필수)
        if (ch.pathRequire && !normalized.includes(ch.pathRequire)) continue;

        // 파일명 매칭 (지정된 경우만)
        if (ch.fileMatch && !ch.fileMatch.test(filename)) continue;

        return ch;
    }

    return null;
}

module.exports = { CHANNELS, detectChannel };
