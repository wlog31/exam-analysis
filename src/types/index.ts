export type Difficulty = '어려움' | '보통' | '쉬움'
export type QuestionType = '선택형' | '단답형' | '서술형'

export interface Question {
  number: number
  type: QuestionType
  contentArea: string
  achievementStandard: string
  difficulty: Difficulty
  points: number
  answer: string | null
}

export interface ExamInfo {
  subject: string
  year: number
  semester: number
  examNumber: number
  grade: number
  date: string
  totalQuestions: number
  multipleChoiceCount: number
  shortAnswerCount: number
  multipleChoiceTotal: number
  shortAnswerTotal: number
}

export type AnswerCode = string

export interface StudentRecord {
  studentId: string
  classNum: string
  seatNum: string
  name: string
  mcAnswers: Record<number, AnswerCode>
  subjectiveScores: Record<string, number>
  mcScore: number
  saScore: number
  shortAnswerScore: number
  essayScore: number
  extraScore: number
  totalScore: number
}

export interface QuestionStat {
  questionNumber: number
  type: QuestionType
  correctRate: number
  wrongDist: Record<string, number>
  avgPointsEarned: number
  irtDifficulty: number | null
  irtDiscrimination: number | null
  question: Question
}

export interface IrtSectionSummary {
  label: string
  difficulty: number | null
  discrimination: number | null
  note?: string
}

export interface SubjectiveIrtItemSpec {
  itemId: string
  itemType: '단답형' | '서술형' | '기타'
  contentArea: string
  achievementStandard: string
  maxScore: number
  categoryValues: number[]
  orderedCategories: boolean
  modelHint: string
  includeInIrt: boolean
  notes: string
}

export interface SubjectiveIrtCategorySpec {
  itemId: string
  categoryScore: number
  categoryLabel: string
  rubricDescription: string
  orderedStep: number
  interpretationNote: string
}

export interface SubjectiveIrtStudentScore {
  studentId: string
  classNum: string
  seatNum: string
  name: string
  scores: Record<string, number | null>
}

export interface SubjectiveIrtData {
  fileName: string
  items: SubjectiveIrtItemSpec[]
  categories: SubjectiveIrtCategorySpec[]
  students: SubjectiveIrtStudentScore[]
  warnings: string[]
}

export interface ExamData {
  examInfo: ExamInfo
  questions: Question[]
  students: StudentRecord[]
  questionStats: QuestionStat[]
  subjectiveQuestionStats: QuestionStat[]
  subjectiveMode: 'combined' | 'split'
  irtSummary: {
    multipleChoice: IrtSectionSummary
    shortAnswer: IrtSectionSummary
    essay?: IrtSectionSummary
  }
  subjectiveIrtData?: SubjectiveIrtData
}

export interface AppSettings {
  questionInfoFileName: string
  answerFileName: string
  subjectiveIrtFileName: string
}
