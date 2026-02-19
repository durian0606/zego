/**
 * 발신자 이메일 → 채널 매핑 규칙
 *
 * 이메일 주소 패턴에 따라 자동으로 채널을 분류합니다.
 * 매칭 순서: 정확한 주소 > 도메인 > 키워드
 *
 * Firebase에서 규칙을 읽어오며, 없으면 기본 규칙 사용
 */

const { getEmailSettings } = require('../firebase');

let SENDER_RULES = [
  // 기본값 (매칭 실패 시)
  {
    pattern: '*',
    channel: '기타',
    folder: '직택배',
    description: '분류되지 않은 이메일'
  }
];

// Firebase에서 규칙 로드
async function loadSenderRulesFromFirebase() {
  try {
    const settings = await getEmailSettings();
    if (settings && settings.senderRules) {
      const rules = Object.values(settings.senderRules)
        .filter(r => r.pattern && r.channel)
        .sort((a, b) => (b.priority || 10) - (a.priority || 10));

      if (rules.length > 0) {
        // 기본값(*) 규칙 찾기
        const defaultRule = SENDER_RULES.find(r => r.pattern === '*');

        // Firebase 규칙 + 기본값
        SENDER_RULES = [...rules, defaultRule];
        console.log(`[이메일] Firebase에서 ${rules.length}개 발신자 규칙 로드 완료`);
        return;
      }
    }
    console.log('[이메일] Firebase 발신자 규칙 없음 → 기본 규칙 사용');
  } catch (error) {
    console.error('[이메일] Firebase 규칙 로드 실패:', error.message);
  }
}

// 초기화 시 규칙 로드
loadSenderRulesFromFirebase();

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
