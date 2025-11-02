export type Level = 'primary' | 'middle' | 'highschool' | 'college';

export interface StyleKnobs {
  passion: 0 | 1 | 2 | 3; // how vivid/energetic
  depth: 1 | 2 | 3;        // level of rigor
  level: Level;
}

export interface IntentParse {
  grade_n: number | null;
  lesson_n: number | null;
  intent: 'make_quiz' | 'true_false' | 'flashcards' | 'explain' | 'general';
  topic: string;
}

export interface ChatSmartResponse {
  completion: string;
  confident: boolean;
  usedKb: boolean;
  topScores: number[];
}
