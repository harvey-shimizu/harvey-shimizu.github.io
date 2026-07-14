export const PLAN_START = "2026-07-15";
export const PLAN_END = "2028-01-14";
export const WALK_TARGET = 10_000;

export type TaskCategory = "hanon" | "exam" | "output" | "review";

export type PlanTask = {
  id: string;
  key: string;
  title: string;
  detail: string;
  minutes: number;
  category: TaskCategory;
  tag: string;
};

export type PlanPhase = {
  month: number;
  start: string;
  end: string;
  focus: string;
  credential: string;
  deliverable: string;
};

export type Milestone = {
  id: string;
  date: string;
  name: string;
  target: string;
};

export const phases: PlanPhase[] = [
  { month: 1, start: "2026-07-15", end: "2026-08-14", focus: "ハノン初級を徹底／現状診断", credential: "TOEIC S&W 診断", deliverable: "3分自己紹介・Executive Memo #1" },
  { month: 2, start: "2026-08-15", end: "2026-09-14", focus: "ハノン初級完了", credential: "TOEIC S&W S160 / W150", deliverable: "模試・弱点トップ3の修正" },
  { month: 3, start: "2026-09-15", end: "2026-10-14", focus: "ハノン中級 前半", credential: "S&W結果分析", deliverable: "STAR事例 #1・英語CV初版" },
  { month: 4, start: "2026-10-15", end: "2026-11-14", focus: "ハノン中級 完了", credential: "Business Speaking / Writing", deliverable: "会議ファシリテーション3分" },
  { month: 5, start: "2026-11-15", end: "2026-12-14", focus: "ハノン上級 1/3", credential: "TOEIC S&W強化", deliverable: "Executive Memo #5・STAR事例 #2" },
  { month: 6, start: "2026-12-15", end: "2027-01-14", focus: "ハノン上級 2/3", credential: "TOEIC S&W最終対策", deliverable: "本番2回分＋面接回答10本" },
  { month: 7, start: "2027-01-15", end: "2027-02-14", focus: "ハノン上級 完了", credential: "TOEIC S&W S180 / W180", deliverable: "結果分析・Linguaskill診断" },
  { month: 8, start: "2027-02-15", end: "2027-03-14", focus: "ハノン統合・実務転用", credential: "Linguaskill Business", deliverable: "C1模試・Executive Memo #8" },
  { month: 9, start: "2027-03-15", end: "2027-04-14", focus: "ハノン維持／応募開始", credential: "Linguaskill C1 180+", deliverable: "海外応募5社・英語CV更新" },
  { month: 10, start: "2027-04-15", end: "2027-05-14", focus: "速読・聴解の精度", credential: "TOEIC L&R 900+（945 stretch）", deliverable: "C1 Advanced診断・STAR事例 #3" },
  { month: 11, start: "2027-05-15", end: "2027-06-14", focus: "C1 Advanced基礎", credential: "Reading / Use of English", deliverable: "応募5社・模擬面接2回" },
  { month: 12, start: "2027-06-15", end: "2027-07-14", focus: "C1 Advanced統合", credential: "Writing / Speaking", deliverable: "フル模試・推薦者候補整理" },
  { month: 13, start: "2027-07-15", end: "2027-08-14", focus: "C1 Advanced本番力", credential: "C1 Advanced 193+ Grade B", deliverable: "本番3回分・面接回答20本" },
  { month: 14, start: "2027-08-15", end: "2027-09-14", focus: "再受験バッファ／面接", credential: "C1 Advanced retake buffer", deliverable: "Director面接・応募10社" },
  { month: 15, start: "2027-09-15", end: "2027-10-14", focus: "IELTS形式習得", credential: "IELTS General Training", deliverable: "Writing Task 1/2 各4本" },
  { month: 16, start: "2027-10-15", end: "2027-11-14", focus: "IELTS 4技能強化", credential: "IELTS GT mock 7.0+", deliverable: "フル模試・Speaking録音8本" },
  { month: 17, start: "2027-11-15", end: "2027-12-14", focus: "IELTS最終調整", credential: "Overall 7.5 / 全技能7.0+", deliverable: "本番・結果分析・必要時再予約" },
  { month: 18, start: "2027-12-15", end: "2028-01-14", focus: "資格統合／役員面接", credential: "Credential Pack完成", deliverable: "証明書・CV・STAR・推薦状を統合" },
];

export const milestones: Milestone[] = [
  { id: "sw-1", date: "2026-09-27", name: "TOEIC Speaking & Writing", target: "S160 / W150" },
  { id: "sw-2", date: "2027-01-24", name: "TOEIC Speaking & Writing", target: "S180 / W180" },
  { id: "linguaskill", date: "2027-03-21", name: "Linguaskill Business", target: "C1 / 180+" },
  { id: "toeic-lr", date: "2027-04-25", name: "TOEIC L&R", target: "900+（945 stretch）" },
  { id: "c1", date: "2027-08-22", name: "C1 Advanced", target: "193+ / Grade B" },
  { id: "ielts", date: "2027-12-12", name: "IELTS General Training", target: "Overall 7.5 / 各7.0+" },
  { id: "pack", date: "2028-01-14", name: "Global Career Evidence Pack", target: "CV・STAR・推薦状・証明書" },
];

export function parseISO(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

export function formatISO(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number) {
  const date = parseISO(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatISO(date);
}

export function diffDays(from: string, to: string) {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);
}

export function compareISO(a: string, b: string) {
  return a.localeCompare(b);
}

export function clampISO(value: string, min: string, max: string) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function todayInJapan() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function dateLabel(iso: string, long = true) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "UTC",
    year: long ? "numeric" : undefined,
    month: long ? "long" : "numeric",
    day: "numeric",
    weekday: "short",
  }).format(parseISO(iso));
}

export function shortDate(iso: string) {
  return iso.replaceAll("-", ".");
}

export function weekStart(iso: string) {
  const day = parseISO(iso).getUTCDay();
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

export function weekEnd(iso: string) {
  return addDays(weekStart(iso), 6);
}

export function planMonthFor(iso: string) {
  return phases.find((phase) => iso >= phase.start && iso <= phase.end) ?? phases[0];
}

export function phaseForDate(iso: string) {
  const week = Math.max(0, Math.floor(diffDays(PLAN_START, iso) / 7));
  if (week < 6) return { name: "Hanon 初級", tag: `初級 W${week + 1}/6`, week, stage: "初級" };
  if (week < 12) return { name: "Hanon 中級", tag: `中級 W${week - 5}/6`, week, stage: "中級" };
  if (week < 22) return { name: "Hanon 上級", tag: `上級 W${week - 11}/10`, week, stage: "上級" };
  if (week < 24) return { name: "Hanon 統合", tag: `統合 W${week - 21}/2`, week, stage: "統合" };
  return { name: "Hanon 維持", tag: "実務転用", week, stage: "維持" };
}

export function strengthTarget(iso: string) {
  const week = Math.max(0, Math.floor(diffDays(PLAN_START, iso) / 7));
  if (week < 2) return 10;
  if (week < 4) return 15;
  if (week < 6) return 20;
  if (week < 8) return 25;
  return 30;
}

const weekdaySkills = [
  "週次レビュー・弱点の再設計",
  "Listening：要点把握とシャドーイング",
  "Reading：速読と論理構造",
  "Speaking：3分プレゼンと即答",
  "Writing：Executive Memo",
  "統合演習：時間制限付きセット",
  "フル模試／セクション模試",
];

const outputByDay = [
  "翌週の会議・面接で使う表現を10本準備",
  "英語ニュースを100語で要約",
  "STAR回答を1本、声に出して録音",
  "3分プレゼンを録音して自己採点",
  "Executive Memoを150〜250語で作成",
  "今週の成果を英語で上司向けに要約",
  "模試の誤答を英語で説明",
];

function examDetail(month: number, day: number) {
  const phase = phases[month - 1];
  if (day === 6) return `${phase.credential}：時間制限付き模試と採点`;
  if (day === 0) return `${phase.credential}：誤答ログと弱点トップ3の修正`;
  return `${phase.credential}｜${weekdaySkills[day]}`;
}

export function tasksForDate(iso: string): PlanTask[] {
  if (iso < PLAN_START || iso > PLAN_END) return [];
  const date = parseISO(iso);
  const day = date.getUTCDay();
  const month = planMonthFor(iso);
  const hanon = phaseForDate(iso);
  const saturday = day === 6;
  const sunday = day === 0;
  const tasks: PlanTask[] = saturday
    ? [
        { id: "hanon", key: `${iso}:hanon`, title: hanon.name, detail: `${hanon.tag}｜反射速度・音声変化・瞬間応答`, minutes: 60, category: "hanon", tag: hanon.tag },
        { id: "exam", key: `${iso}:exam`, title: month.credential, detail: examDetail(month.month, day), minutes: 75, category: "exam", tag: `M${month.month}` },
        { id: "output", key: `${iso}:output`, title: "Business Output", detail: outputByDay[day], minutes: 30, category: "output", tag: "実務転用" },
        { id: "review", key: `${iso}:review`, title: "誤答・語彙レビュー", detail: "今週の誤りを原因別に分類し、再テスト日を設定", minutes: 15, category: "review", tag: "週次" },
      ]
    : sunday
      ? [
          { id: "hanon", key: `${iso}:hanon`, title: hanon.name, detail: `${hanon.tag}｜通し練習と録音比較`, minutes: 45, category: "hanon", tag: hanon.tag },
          { id: "exam", key: `${iso}:exam`, title: "Error Log & Recovery", detail: examDetail(month.month, day), minutes: 35, category: "exam", tag: `M${month.month}` },
          { id: "output", key: `${iso}:output`, title: "Career Evidence", detail: "STAR事例・英語CV・推薦者候補のいずれかを更新", minutes: 25, category: "output", tag: "Career" },
          { id: "review", key: `${iso}:review`, title: "Weekly Review", detail: "達成率、学習時間、翌週の重点3項目を確定", minutes: 15, category: "review", tag: "週次" },
        ]
      : [
          { id: "hanon", key: `${iso}:hanon`, title: hanon.name, detail: `${hanon.tag}｜口が止まった箇所を3周して録音`, minutes: 45, category: "hanon", tag: hanon.tag },
          { id: "exam", key: `${iso}:exam`, title: month.credential, detail: examDetail(month.month, day), minutes: 45, category: "exam", tag: `M${month.month}` },
          { id: "output", key: `${iso}:output`, title: "Business Output", detail: outputByDay[day], minutes: 20, category: "output", tag: "実務転用" },
          { id: "review", key: `${iso}:review`, title: "語彙・誤答ログ", detail: "重要語10語＋前日の誤りを翌日再テストへ登録", minutes: 10, category: "review", tag: "毎日" },
        ];

  if (date.getUTCDate() === 14) {
    tasks.push({
      id: "monthly",
      key: `${iso}:monthly`,
      title: "Monthly Executive Review",
      detail: "フル模試・3分プレゼン・Executive Memo 250語・STAR/CV更新",
      minutes: 60,
      category: "output",
      tag: "月次",
    });
  }
  return tasks;
}

export function dateRange(start: string, end: string) {
  if (end < start) return [];
  const result: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) result.push(cursor);
  return result;
}
