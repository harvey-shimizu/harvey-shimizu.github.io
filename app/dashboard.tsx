"use client";

import {
  ChangeEvent,
  CSSProperties,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  PLAN_END,
  PLAN_START,
  WALK_TARGET,
  addDays,
  clampISO,
  dateLabel,
  dateRange,
  diffDays,
  milestones,
  phaseForDate,
  phases,
  planMonthFor,
  shortDate,
  strengthTarget,
  tasksForDate,
  todayInJapan,
  weekEnd,
  weekStart,
  type PlanTask,
} from "./plan";

type TrackerStore = {
  version: 2;
  completed: Record<string, boolean>;
  steps: Record<string, number>;
  recoveries: Record<string, string[]>;
  notes: Record<string, string>;
};

type Metric = { completed: number; total: number; percent: number };
type IconName =
  | "grid"
  | "book"
  | "check"
  | "chart"
  | "history"
  | "habit"
  | "recovery"
  | "resource"
  | "calendar"
  | "bell"
  | "edit"
  | "download"
  | "upload"
  | "copy"
  | "arrow"
  | "walk"
  | "plank"
  | "strength"
  | "close";

const STORAGE_KEY = "harvey-english-career-tracker-v2";

const emptyStore: TrackerStore = {
  version: 2,
  completed: {},
  steps: {},
  recoveries: {},
  notes: {},
};

const navItems: { id: string; label: string; icon: IconName }[] = [
  { id: "dashboard", label: "ダッシュボード", icon: "grid" },
  { id: "curriculum", label: "カリキュラム", icon: "book" },
  { id: "tasks", label: "タスク", icon: "check" },
  { id: "progress", label: "進捗レポート", icon: "chart" },
  { id: "history", label: "学習履歴", icon: "history" },
  { id: "habits", label: "習慣トラッカー", icon: "habit" },
  { id: "recovery", label: "リカバリー", icon: "recovery" },
  { id: "resources", label: "資格ロードマップ", icon: "resource" },
];

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
    book: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M4 4.5v17A2.5 2.5 0 0 1 6.5 19H20" /></>,
    check: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8 9 2 2 4-4M8 15h8" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20V7" /><path d="M2 20h22" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    habit: <><path d="M4 20V8l4-4 4 4v12M12 20V12l4-4 4 4v8" /><path d="M2 20h20" /></>,
    recovery: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8" /><path d="M4 3v5h5M12 8v5M12 17h.01" /></>,
    resource: <><path d="M5 3h14v18H5z" /><path d="M8 7h8M8 11h8M8 15h5" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    edit: <><path d="m4 20 4.5-1 10-10a2 2 0 0 0-3-3l-10 10z" /><path d="m14 7 3 3" /></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 21h16" /></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 21h16" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    arrow: <><path d="m9 18 6-6-6-6" /></>,
    walk: <><path d="M13 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM10 7l3-1 3 3 3 1M13 6l-2 6-4 3M11 12l4 3 1 5M7 15l-3 5" /></>,
    plank: <><circle cx="19" cy="8" r="2" /><path d="M3 17h18M6 16l2-5 6 1 3-3M8 11l-3 2" /></>,
    strength: <><path d="M3 10v4M6 8v8M9 11h6M18 8v8M21 10v4" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function percentage(completed: number, total: number) {
  return total ? Math.round((completed / total) * 100) : 0;
}

function Ring({ value, label, size = "normal" }: { value: number; label?: string; size?: "small" | "normal" | "large" }) {
  const safe = Math.min(100, Math.max(0, value));
  const style = { "--ring-value": `${safe * 3.6}deg` } as CSSProperties;
  return (
    <div className={`progress-ring ${size}`} style={style} aria-label={`${label ?? "達成率"} ${safe}%`}>
      <div className="ring-inner"><strong>{safe}</strong><span>%</span>{label && <small>{label}</small>}</div>
    </div>
  );
}

function TaskCheckbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button className={`task-checkbox ${checked ? "checked" : ""}`} type="button" role="checkbox" aria-checked={checked} aria-label={`${label}を${checked ? "未完了" : "完了"}にする`} onClick={onChange}>
      {checked && <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-9" /></svg>}
    </button>
  );
}

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "red" | "green" | "amber" }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

function AppButton({ children, icon, onClick, variant = "secondary", disabled = false }: { children: ReactNode; icon?: IconName; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger"; disabled?: boolean }) {
  return <button type="button" className={`app-button ${variant}`} onClick={onClick} disabled={disabled}>{icon && <Icon name={icon} size={17} />}{children}</button>;
}

export default function Dashboard() {
  const today = todayInJapan();
  const initialDate = clampISO(today, PLAN_START, PLAN_END);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [store, setStore] = useState<TrackerStore>(emptyStore);
  const [hydrated, setHydrated] = useState(false);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [dataModal, setDataModal] = useState(false);
  const [toast, setToast] = useState("");
  const [showAllRecovery, setShowAllRecovery] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<TrackerStore>;
          setStore({
            version: 2,
            completed: parsed.completed ?? {},
            steps: parsed.steps ?? {},
            recoveries: parsed.recoveries ?? {},
            notes: parsed.notes ?? {},
          });
        }
      } catch {
        setToast("保存データを読み込めませんでした。新しい記録として開始します。");
      }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const phase = planMonthFor(selectedDate);
  const hanon = phaseForDate(selectedDate);
  const strength = strengthTarget(selectedDate);
  const selectedTasks = useMemo(() => tasksForDate(selectedDate), [selectedDate]);
  const selectedWeekStart = weekStart(selectedDate);
  const selectedWeekEnd = weekEnd(selectedDate);
  const saturday = addDays(selectedWeekStart, 5);
  const sunday = addDays(selectedWeekStart, 6);

  function isWalkDone(weekISO: string) {
    const sat = addDays(weekISO, 5);
    const sun = addDays(weekISO, 6);
    return Math.max(store.steps[sat] ?? 0, store.steps[sun] ?? 0) >= WALK_TARGET;
  }

  function expectedKeys(iso: string) {
    const keys = tasksForDate(iso).map((task) => task.key);
    keys.push(`${iso}:plank`, `${iso}:pushup`, `${iso}:squat`);
    if (new Date(`${iso}T00:00:00Z`).getUTCDay() === 6) keys.push(`walk:${weekStart(iso)}`);
    return keys;
  }

  function keyDone(key: string) {
    if (key.startsWith("walk:")) return isWalkDone(key.slice(5));
    return Boolean(store.completed[key]);
  }

  function metric(start: string, end: string): Metric {
    const safeStart = start < PLAN_START ? PLAN_START : start;
    const safeEnd = end > PLAN_END ? PLAN_END : end;
    if (safeEnd < safeStart) return { completed: 0, total: 0, percent: 0 };
    const keys = dateRange(safeStart, safeEnd).flatMap(expectedKeys);
    const completed = keys.reduce((sum, key) => sum + (keyDone(key) ? 1 : 0), 0);
    return { completed, total: keys.length, percent: percentage(completed, keys.length) };
  }

  const dueEnd = today < PLAN_START ? addDays(PLAN_START, -1) : today > PLAN_END ? PLAN_END : today;
  const overall = metric(PLAN_START, dueEnd);
  const currentWeekMetric = metric(selectedWeekStart, selectedWeekEnd > dueEnd ? dueEnd : selectedWeekEnd);
  const currentMonthMetric = metric(phase.start, phase.end > dueEnd ? dueEnd : phase.end);
  const selectedDayMetric = metric(selectedDate, selectedDate);
  const totalDays = diffDays(PLAN_START, PLAN_END) + 1;
  const elapsedDays = today < PLAN_START ? 0 : Math.min(totalDays, diffDays(PLAN_START, today) + 1);
  const timePercent = percentage(elapsedDays, totalDays);
  const daysRemaining = Math.max(0, diffDays(today, PLAN_END));
  const monthsElapsed = Math.min(18, Math.max(0, Math.round((elapsedDays / totalDays) * 180) / 10));

  const assignedRecovery = store.recoveries[selectedDate] ?? [];
  const assignedTasks = assignedRecovery
    .map((key) => tasksForDate(key.slice(0, 10)).find((task) => task.key === key))
    .filter((task): task is PlanTask => Boolean(task) && !store.completed[task!.key]);

  const recoveryQueue = (() => {
    const reference = selectedDate < today ? selectedDate : today;
    const start = addDays(reference, showAllRecovery ? -30 : -7);
    return dateRange(start < PLAN_START ? PLAN_START : start, addDays(reference, -1))
      .flatMap((iso) => tasksForDate(iso))
      .filter((task) => !store.completed[task.key])
      .reverse();
  })();

  const weekDays = dateRange(selectedWeekStart, selectedWeekEnd).map((iso) => ({ iso, metric: metric(iso, iso) }));

  function toggleCompletion(key: string) {
    setStore((current) => ({
      ...current,
      completed: { ...current.completed, [key]: !current.completed[key] },
    }));
  }

  function setStep(iso: string, value: string) {
    const next = Math.min(200_000, Math.max(0, Number(value.replace(/[^0-9]/g, "")) || 0));
    setStore((current) => ({ ...current, steps: { ...current.steps, [iso]: next } }));
  }

  function addRecovery(task: PlanTask) {
    setStore((current) => {
      const assigned = current.recoveries[selectedDate] ?? [];
      if (assigned.includes(task.key)) return current;
      return { ...current, recoveries: { ...current.recoveries, [selectedDate]: [...assigned, task.key] } };
    });
    setToast("今日のタスクにリカバリーを追加しました");
  }

  function removeRecovery(taskKey: string) {
    setStore((current) => ({
      ...current,
      recoveries: { ...current.recoveries, [selectedDate]: (current.recoveries[selectedDate] ?? []).filter((key) => key !== taskKey) },
    }));
  }

  function goToSection(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function changeDate(next: string) {
    setSelectedDate(clampISO(next, PLAN_START, PLAN_END));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exportData() {
    const payload = { exportedAt: new Date().toISOString(), plan: { start: PLAN_START, end: PLAN_END }, data: store };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `harvey-tracker-${today}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("バックアップを書き出しました");
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const data = (payload.data ?? payload) as Partial<TrackerStore>;
      setStore({ version: 2, completed: data.completed ?? {}, steps: data.steps ?? {}, recoveries: data.recoveries ?? {}, notes: data.notes ?? {} });
      setToast("バックアップを復元しました");
      setDataModal(false);
    } catch {
      setToast("このファイルは読み込めませんでした");
    }
    event.target.value = "";
  }

  async function copyReport() {
    const text = [
      `Harvey English Career Tracker｜${dateLabel(selectedDate)}`,
      `18か月実行達成率 ${overall.percent}%（${overall.completed}/${overall.total}）`,
      `今週 ${currentWeekMetric.percent}%｜今月 ${currentMonthMetric.percent}%｜残り ${daysRemaining}日`,
      `現在：Month ${phase.month}「${phase.focus}」／${hanon.tag}`,
      `本日：${selectedDayMetric.completed}/${selectedDayMetric.total} 完了`,
      `健康習慣：プランク ${store.completed[`${selectedDate}:plank`] ? "○" : "未"}、腕立て${strength}回 ${store.completed[`${selectedDate}:pushup`] ? "○" : "未"}、スクワット${strength}回 ${store.completed[`${selectedDate}:squat`] ? "○" : "未"}`,
      `週末ウォーク：土 ${store.steps[saturday] ?? 0}歩／日 ${store.steps[sunday] ?? 0}歩（どちらか10,000歩）`,
      store.notes[selectedDate] ? `メモ：${store.notes[selectedDate]}` : "",
    ].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(text);
    setToast("進捗サマリーをコピーしました");
  }

  const planMarker = Math.min(100, Math.max(0, timePercent));
  const dailyMinutes = selectedTasks.reduce((sum, task) => sum + task.minutes, 0);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="メインナビゲーション">
        <div className="brand"><strong>Harvey</strong><span>English<br />Career Tracker</span><small>18-MONTH<br />EXECUTIVE ENGLISH</small></div>
        <nav className="side-nav">
          {navItems.map((item) => <button key={item.id} type="button" className={activeSection === item.id ? "active" : ""} onClick={() => goToSection(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}
        </nav>
        <div className="sidebar-goal"><span>最終目標</span><strong>C1 / EXECUTIVE</strong><small>18ヶ月後の自分へ</small><button type="button" onClick={() => goToSection("resources")}>目標を確認 <Icon name="arrow" size={16} /></button></div>
        <div className="profile"><span className="avatar">H</span><span><strong>Harvey</strong><small>端末内に自動保存</small></span><button type="button" aria-label="データ管理を開く" onClick={() => setDataModal(true)}><Icon name="arrow" size={17} /></button></div>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar">
          <div className="date-control">
            <button type="button" aria-label="前日" onClick={() => changeDate(addDays(selectedDate, -1))}>‹</button>
            <Icon name="calendar" size={22} />
            <label><span className="sr-only">表示する日付</span><input type="date" min={PLAN_START} max={PLAN_END} value={selectedDate} onChange={(event) => changeDate(event.target.value)} /></label>
            <strong>{dateLabel(selectedDate)}</strong>
            <button type="button" aria-label="翌日" onClick={() => changeDate(addDays(selectedDate, 1))}>›</button>
          </div>
          <div className="top-actions">
            <button className="notification" type="button" aria-label={`${recoveryQueue.length}件の未実施`} onClick={() => goToSection("recovery")}><Icon name="bell" /><span>{Math.min(99, recoveryQueue.length)}</span></button>
            <AppButton icon="copy" onClick={copyReport}>進捗をコピー</AppButton>
            <AppButton icon="edit" variant="primary" onClick={() => document.getElementById("daily-note")?.focus()}>今日の記録</AppButton>
          </div>
        </header>

        <section className="program-timeline" aria-label="18か月プログラム期間">
          <div className="timeline-title"><strong>18か月プログラム</strong><span>{shortDate(PLAN_START)} – {shortDate(PLAN_END)}</span></div>
          <div className="timeline-track">
            <div className="timeline-progress" style={{ width: `${planMarker}%` }} />
            <div className="timeline-current" style={{ left: `${planMarker}%` }}><i /><strong>現在</strong><span>{shortDate(today)}</span></div>
            <div className="timeline-point start"><i /><strong>START</strong><span>{shortDate(PLAN_START)}</span></div>
            <div className="timeline-point six"><i /><strong>6ヶ月</strong><span>2027.01.15</span></div>
            <div className="timeline-point twelve"><i /><strong>12ヶ月</strong><span>2027.07.15</span></div>
            <div className="timeline-point goal"><i /><strong>GOAL</strong><span>{shortDate(PLAN_END)}</span></div>
          </div>
        </section>

        <section className="kpi-grid" id="progress">
          <article className="kpi-card achievement">
            <div><span className="eyebrow">実行達成率</span><p className="hero-number">{overall.percent}<small>%</small></p><span className="kpi-caption">期限到来分 {overall.completed} / {overall.total} タスク</span></div>
            <Ring value={timePercent} label={`${monthsElapsed} / 18ヶ月`} size="large" />
            <div className="remaining"><span>あと</span><strong>{daysRemaining}</strong><em>日</em><small>目標達成まで</small></div>
          </article>
          <article className="kpi-card period"><div><span className="eyebrow">今週</span><Ring value={currentWeekMetric.percent} /><p>{currentWeekMetric.completed} / {currentWeekMetric.total} タスク</p></div><div><span className="eyebrow">今月</span><Ring value={currentMonthMetric.percent} /><p>{currentMonthMetric.completed} / {currentMonthMetric.total} タスク</p></div></article>
        </section>

        <div className="primary-grid">
          <section className="panel tasks-panel" id="tasks">
            <div className="panel-heading"><div><h2>今日のタスク <span>{selectedTasks.length + assignedTasks.length}</span></h2><p>標準 {dailyMinutes}分・最低実行ライン30分</p></div><div className="day-score"><strong>{selectedDayMetric.percent}%</strong><span>本日</span></div></div>
            {assignedTasks.length > 0 && <div className="recovery-assigned"><span>RECOVERY</span>{assignedTasks.map((task) => <TaskRow key={`assigned-${task.key}`} task={task} checked={Boolean(store.completed[task.key])} onToggle={() => toggleCompletion(task.key)} recovered onRemove={() => removeRecovery(task.key)} />)}</div>}
            <div className="task-list">
              {selectedTasks.map((task) => <TaskRow key={task.key} task={task} checked={Boolean(store.completed[task.key])} onToggle={() => toggleCompletion(task.key)} />)}
            </div>
            <label className="daily-note"><span>今日のひと言メモ</span><textarea id="daily-note" value={store.notes[selectedDate] ?? ""} placeholder="できたこと、詰まった点、明日の一手…" onChange={(event) => setStore((current) => ({ ...current, notes: { ...current.notes, [selectedDate]: event.target.value } }))} /></label>
          </section>

          <aside className="right-column">
            <section className="panel habits-quick" id="habits">
              <div className="panel-heading"><div><h2>今日の習慣</h2><p>小さく始めて、9週目に30回</p></div><StatusPill tone="green">W{Math.floor(Math.max(0, diffDays(PLAN_START, selectedDate)) / 7) + 1}</StatusPill></div>
              <HabitRow icon="plank" title="5分プランク" detail="毎日・フォーム優先" checked={Boolean(store.completed[`${selectedDate}:plank`])} onToggle={() => toggleCompletion(`${selectedDate}:plank`)} />
              <HabitRow icon="strength" title={`腕立て伏せ ${strength}回`} detail={strength < 30 ? `段階目標・最終30回` : "到達目標・毎日30回"} checked={Boolean(store.completed[`${selectedDate}:pushup`])} onToggle={() => toggleCompletion(`${selectedDate}:pushup`)} />
              <HabitRow icon="strength" title={`スクワット ${strength}回`} detail={strength < 30 ? `段階目標・最終30回` : "到達目標・毎日30回"} checked={Boolean(store.completed[`${selectedDate}:squat`])} onToggle={() => toggleCompletion(`${selectedDate}:squat`)} />
            </section>

            <section className={`panel walking-card ${isWalkDone(selectedWeekStart) ? "complete" : ""}`}>
              <div className="panel-heading"><div><h2><Icon name="walk" /> 週末ウォーキング</h2><p>土日のどちらか一日で10,000歩</p></div>{isWalkDone(selectedWeekStart) ? <StatusPill tone="green">達成</StatusPill> : <StatusPill tone="amber">未達成</StatusPill>}</div>
              <StepInput label="土" iso={saturday} value={store.steps[saturday]} onChange={setStep} />
              <StepInput label="日" iso={sunday} value={store.steps[sunday]} onChange={setStep} />
              <div className="walk-progress"><span style={{ width: `${Math.min(100, (Math.max(store.steps[saturday] ?? 0, store.steps[sunday] ?? 0) / WALK_TARGET) * 100)}%` }} /></div>
              <small>高い方を週の実績として集計します。両日歩いても1目標です。</small>
            </section>

            <section className="panel recovery-card" id="recovery">
              <div className="panel-heading"><div><h2>未実施リカバリー <span className="count-badge">{recoveryQueue.length}</span></h2><p>直近{showAllRecovery ? "30" : "7"}日</p></div><button type="button" className="text-button" onClick={() => setShowAllRecovery((value) => !value)}>{showAllRecovery ? "7日に戻す" : "30日を見る"} <Icon name="arrow" size={15} /></button></div>
              <div className="recovery-list">
                {recoveryQueue.slice(0, 4).map((task) => {
                  const assigned = assignedRecovery.includes(task.key);
                  return <div className="recovery-item" key={task.key}><span className="alert-mark">!</span><div><strong>{task.title}</strong><small>{shortDate(task.key.slice(0, 10))}・{task.detail}</small></div><button type="button" className={assigned ? "added" : ""} onClick={() => addRecovery(task)} disabled={assigned}>{assigned ? "追加済み" : "今日に追加"}</button></div>;
                })}
                {recoveryQueue.length === 0 && <div className="empty-state"><span>✓</span><p>未実施タスクはありません</p></div>}
              </div>
            </section>
          </aside>
        </div>

        <section className="panel weekly-panel" id="history">
          <div className="panel-heading"><div><h2>今週の実行状況</h2><p>{shortDate(selectedWeekStart)} – {shortDate(selectedWeekEnd)}</p></div><strong className="weekly-total">{currentWeekMetric.percent}%</strong></div>
          <div className="week-bars">
            {weekDays.map(({ iso, metric: dayMetric }) => <button type="button" key={iso} className={iso === selectedDate ? "selected" : ""} onClick={() => changeDate(iso)}><span className="bar-track"><i style={{ height: `${dayMetric.percent}%` }} /></span><strong>{dayMetric.percent}%</strong><small>{new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`))}</small><em>{new Date(`${iso}T00:00:00Z`).getUTCDate()}</em></button>)}
          </div>
        </section>

        <section className="section-block" id="curriculum">
          <div className="section-heading"><div><span className="eyebrow">MONTH {phase.month} / 18</span><h2>18か月カリキュラム</h2><p>英語のハノンを24週で初級→中級→上級→統合。その後は各資格と実務へ転用します。</p></div><div className="phase-now"><span>現在の重点</span><strong>{phase.focus}</strong><small>{phase.credential}</small></div></div>
          <div className="phase-grid">
            {phases.map((item) => <article key={item.month} className={`${item.month === phase.month ? "current" : ""} ${item.end < today ? "past" : ""}`}><div><span>M{item.month}</span>{item.month === phase.month && <StatusPill tone="red">NOW</StatusPill>}</div><strong>{item.focus}</strong><p>{item.credential}</p><small>{item.deliverable}</small></article>)}
          </div>
        </section>

        <section className="section-block roadmap" id="resources">
          <div className="section-heading"><div><span className="eyebrow">EVIDENCE</span><h2>資格ロードマップ</h2><p>Manager／Director候補として対外的に提示する資格と成果物です。</p></div><AppButton icon="download" onClick={() => setDataModal(true)}>データ管理</AppButton></div>
          <div className="milestone-list">
            {milestones.map((milestone, index) => {
              const key = `milestone:${milestone.id}`;
              const checked = Boolean(store.completed[key]);
              return <article key={milestone.id} className={checked ? "complete" : ""}><div className="milestone-index">{String(index + 1).padStart(2, "0")}</div><div><span>{shortDate(milestone.date)}</span><strong>{milestone.name}</strong><p>{milestone.target}</p></div><TaskCheckbox checked={checked} onChange={() => toggleCompletion(key)} label={milestone.name} /></article>;
            })}
          </div>
        </section>

        <footer><span>Harvey English Career Tracker</span><p>2026.07.15 – 2028.01.14 ・ Keep the promise you made to yourself.</p></footer>
      </main>

      <nav className="mobile-nav" aria-label="モバイルナビゲーション">
        {[navItems[0], navItems[2], navItems[3], navItems[5], navItems[6]].map((item) => <button key={item.id} type="button" className={activeSection === item.id ? "active" : ""} onClick={() => goToSection(item.id)}><Icon name={item.icon} /><span>{item.label.replace("トラッカー", "").replace("レポート", "")}</span></button>)}
      </nav>

      {dataModal && <div className="modal-backdrop" role="presentation" onMouseDown={() => setDataModal(false)}><section className="data-modal" role="dialog" aria-modal="true" aria-labelledby="data-modal-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="閉じる" onClick={() => setDataModal(false)}><Icon name="close" /></button><span className="eyebrow">DATA & BACKUP</span><h2 id="data-modal-title">記録データの管理</h2><p>チェック・歩数・メモはこのブラウザ内に自動保存されます。MacとiPhone間で移す場合は、JSONを書き出してもう一方の端末で読み込んでください。</p><div className="modal-actions"><AppButton icon="download" variant="primary" onClick={exportData}>バックアップを書き出す</AppButton><AppButton icon="upload" onClick={() => fileRef.current?.click()}>バックアップを読み込む</AppButton><input ref={fileRef} type="file" accept="application/json,.json" onChange={importData} hidden /><AppButton icon="copy" variant="ghost" onClick={copyReport}>進捗サマリーをコピー</AppButton></div><div className="sync-note"><strong>Mac ↔ iPhoneの自動同期について</strong><p>GitHub Pagesだけでは個人データを安全に同期できません。現在は端末内保存＋バックアップ方式です。将来、認証付きクラウド保存を接続できる構造にしています。</p></div></section></div>}

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}

function TaskRow({ task, checked, onToggle, recovered = false, onRemove }: { task: PlanTask; checked: boolean; onToggle: () => void; recovered?: boolean; onRemove?: () => void }) {
  return <div className={`task-row ${checked ? "complete" : ""}`}><TaskCheckbox checked={checked} onChange={onToggle} label={task.title} /><div className="task-copy"><strong>{task.title}</strong><span>{task.detail}</span></div><StatusPill tone={task.category === "hanon" ? "red" : task.category === "output" ? "green" : task.category === "review" ? "amber" : "neutral"}>{recovered ? "RECOVERY" : task.tag}</StatusPill><span className="task-minutes">{task.minutes}<small>min</small></span>{onRemove ? <button type="button" className="remove-task" onClick={onRemove} aria-label="リカバリーから外す"><Icon name="close" size={16} /></button> : <Icon name="arrow" size={17} />}</div>;
}

function HabitRow({ icon, title, detail, checked, onToggle }: { icon: IconName; title: string; detail: string; checked: boolean; onToggle: () => void }) {
  return <div className={`habit-row ${checked ? "complete" : ""}`}><span className="habit-icon"><Icon name={icon} /></span><div><strong>{title}</strong><small>{detail}</small></div><TaskCheckbox checked={checked} onChange={onToggle} label={title} /></div>;
}

function StepInput({ label, iso, value, onChange }: { label: string; iso: string; value?: number; onChange: (iso: string, value: string) => void }) {
  const complete = (value ?? 0) >= WALK_TARGET;
  return <label className={`step-row ${complete ? "complete" : ""}`}><strong>{label}</strong><span className="step-date">{shortDate(iso).slice(5)}</span><span className="step-field"><input inputMode="numeric" pattern="[0-9]*" value={value || ""} placeholder="0" aria-label={`${label}曜日の歩数`} onChange={(event) => onChange(iso, event.target.value)} /><em>歩</em></span><span className="step-target">/ 10,000</span><i>{complete ? "✓" : ""}</i></label>;
}
