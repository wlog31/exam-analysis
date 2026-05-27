/**
 * buildAiPrompt.ts
 * StudentRecordSpec 데이터를 AI 세특 초안 요청 프롬프트로 변환합니다.
 */

import type { StudentRecordSpec } from './buildStudentRecord'
import type { ExamInfo } from '../types'

export function buildSespecPrompt(
  spec: StudentRecordSpec,
  examInfo: ExamInfo,
  studentName: string,
): string {
  const strong = spec.strong.length
    ? spec.strong.map(g => `${g.code}(${g.rate.toFixed(0)}%)`).join(', ')
    : '해당 없음'
  const weak = spec.weak.length
    ? spec.weak.map(g => `${g.code}(${g.rate.toFixed(0)}%)`).join(', ')
    : '해당 없음'
  const mid = spec.mid.length
    ? spec.mid.map(g => `${g.code}(${g.rate.toFixed(0)}%)`).join(', ')
    : '해당 없음'

  const checkedItems = spec.checklist
    .filter(c => c.checked)
    .map(c => c.label)
    .join(', ') || '없음'

  return `당신은 한국 고등학교 교사입니다. 아래 학생 시험 데이터를 바탕으로 학교생활기록부의 세부능력 및 특기사항 초안을 작성해 주세요.

[시험 정보]
- 과목: ${examInfo.subject}
- ${examInfo.year}학년도 ${examInfo.semester}학기 ${examInfo.examNumber}차 지필평가

[학생 성취 데이터]
- 총점: ${spec.plainPct.toFixed(1)}점
- 석차: ${spec.rank}위 (상위 ${spec.rankPct.toFixed(1)}%)
- 학습 유형: ${spec.studentType}
- 고난도 문항 정답률: ${spec.hardRate.toFixed(1)}%

[영역별 수행 수준]
- 강점 영역(80% 이상): ${strong}
- 중간 영역(50~79%): ${mid}
- 보완 영역(50% 미만): ${weak}

[세특 체크리스트 충족 항목]
${checkedItems}

[자동 생성 초안 (참고용)]
${spec.draft}

[작성 지침]
1. 학생의 성취 수준과 특성을 구체적으로 서술하세요.
2. 강점은 명확히 드러내고, 보완 영역은 발전 가능성 중심으로 서술하세요.
3. 200~300자 내외의 한 단락으로 작성하세요.
4. 학생 이름(${studentName})은 포함하지 마세요.
5. 자연스러운 교육적 문체를 사용하세요.
6. 위 자동 생성 초안을 참고하되, 더 자연스럽고 풍부한 내용으로 개선하세요.
7. 결과물 외에 다른 설명이나 서두는 쓰지 마세요.

세부능력 및 특기사항:`
}
