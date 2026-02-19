/**
 * 발신자 이메일 → 채널 매핑 규칙
 *
 * 이메일 주소 패턴에 따라 자동으로 채널을 분류합니다.
 * 매칭 순서: 정확한 주소 > 도메인 > 키워드
 */

const SENDER_RULES = [
  // 정확한 이메일 주소 매칭
  {
    pattern: 'order@example.com',
    channel: '아이원',
    folder: '직택배',
    description: '아이원 자동 주문서'
  },

  // 도메인 매칭 (모든 @domain.com 이메일)
  {
    pattern: '@smartstore.naver.com',
    channel: '네이버',
    folder: '직택배',
    description: '네이버 스마트스토어'
  },

  // 키워드 매칭 (이메일에 특정 단어 포함)
  {
    pattern: 'kakao',
    channel: '카카오',
    folder: '카카오',
    description: '카카오 관련 이메일'
  },

  // 기본값 (매칭 실패 시)
  {
    pattern: '*',
    channel: '기타',
    folder: '직택배',
    description: '분류되지 않은 이메일'
  }
];

/**
 * 발신자 이메일로 채널 감지
 * @param {string} from - 발신자 이메일 주소
 * @returns {{channel: string, folder: string, description: string}}
 */
function detectChannelBySender(from) {
  const email = from.toLowerCase();

  for (const rule of SENDER_RULES) {
    const pattern = rule.pattern.toLowerCase();

    // 정확한 주소 매칭
    if (pattern !== '*' && email === pattern) {
      return {
        channel: rule.channel,
        folder: rule.folder,
        description: rule.description
      };
    }

    // 도메인 또는 키워드 매칭
    if (pattern !== '*' && email.includes(pattern)) {
      return {
        channel: rule.channel,
        folder: rule.folder,
        description: rule.description
      };
    }
  }

  // 기본값 반환
  const defaultRule = SENDER_RULES.find(r => r.pattern === '*');
  return {
    channel: defaultRule.channel,
    folder: defaultRule.folder,
    description: defaultRule.description
  };
}

/**
 * 규칙 추가/수정
 * @param {object} rule - {pattern, channel, folder, description}
 */
function addSenderRule(rule) {
  // 기본값(*) 제외하고 배열 앞부분에 추가 (우선순위 높음)
  const defaultIndex = SENDER_RULES.findIndex(r => r.pattern === '*');
  SENDER_RULES.splice(defaultIndex, 0, rule);
}

/**
 * 모든 규칙 조회
 */
function getSenderRules() {
  return SENDER_RULES;
}

module.exports = {
  detectChannelBySender,
  addSenderRule,
  getSenderRules
};
