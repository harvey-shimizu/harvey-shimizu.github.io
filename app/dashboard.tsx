"use client";

import {
  ChangeEvent,
  CSSProperties,
  FormEvent,
  ReactNode,
  useCallback,
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
import { syncApi, type AuthResult, type GitHubSettingsResult } from "./sync-api";

type TrackerStore = {
  version: 3;
  completed: Record<string, boolean>;
  steps: Record<string, number>;
  recoveries: Record<string, string[]>;
  notes: Record<string, string>;
  modified: Record<string, number>;
};

type SyncStatus = {
  state: "off" | "idle" | "syncing" | "success" | "error";
  message: string;
  lastSyncAt?: string;
};

type AuthState = {
  checking: boolean;
  authenticated: boolean;
  setupRequired: boolean;
  username: string;
  error: string;
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
  | "cloud"
  | "shield"
  | "key"
  | "close";

const STORAGE_KEY = "harvey-english-career-tracker-v2";
const SESSION_KEY = "harvey-tracker-session-v1";

const emptyStore: TrackerStore = {
  version: 3,
  completed: {},
  steps: {},
  recoveries: {},
  notes: {},
  modified: {},
};

function normalizeStore(value?: Partial<TrackerStore> | null): TrackerStore {
  return {
    version: 3,
    completed: value?.completed ?? {},
    steps: value?.steps ?? {},
    recoveries: value?.recoveries ?? {},
    notes: value?.notes ?? {},
    modified: value?.modified ?? {},
  };
}

function stampStore(value: Partial<TrackerStore>) {
  const store = normalizeStore(value);
  const now = Date.now();
  const modified = { ...store.modified };
  Object.keys(store.completed).forEach((key) => { modified[`completed:${key}`] = now; });
  Object.keys(store.steps).forEach((key) => { modified[`steps:${key}`] = now; });
  Object.keys(store.recoveries).forEach((key) => { modified[`recoveries:${key}`] = now; });
  Object.keys(store.notes).forEach((key) => { modified[`notes:${key}`] = now; });
  return { ...store, modified };
}

function mergeRecord<T>(
  prefix: string,
  local: Record<string, T>,
  remote: Record<string, T>,
  localModified: Record<string, number>,
  remoteModified: Record<string, number>,
  resolveLegacy: (localValue: T | undefined, remoteValue: T | undefined) => T | undefined,
) {
  const merged: Record<string, T> = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  keys.forEach((key) => {
    const localTime = localModified[`${prefix}:${key}`] ?? 0;
    const remoteTime = remoteModified[`${prefix}:${key}`] ?? 0;
    const value = localTime > remoteTime
      ? local[key]
      : remoteTime > localTime
        ? remote[key]
        : resolveLegacy(local[key], remote[key]);
    if (value !== undefined) merged[key] = value;
  });
  return merged;
}

function mergeStores(localValue: Partial<TrackerStore>, remoteValue: Partial<TrackerStore>) {
  const local = normalizeStore(localValue);
  const remote = normalizeStore(remoteValue);
  const modified: Record<string, number> = {};
  new Set([...Object.keys(local.modified), ...Object.keys(remote.modified)]).forEach((key) => {
    modified[key] = Math.max(local.modified[key] ?? 0, remote.modified[key] ?? 0);
  });
  return {
    version: 3 as const,
    completed: mergeRecord("completed", local.completed, remote.completed, local.modified, remote.modified, (a, b) => Boolean(a || b)),
    steps: mergeRecord("steps", local.steps, remote.steps, local.modified, remote.modified, (a, b) => Math.max(a ?? 0, b ?? 0)),
    recoveries: mergeRecord("recoveries", local.recoveries, remote.recoveries, local.modified, remote.modified, (a, b) => Array.from(new Set([...(a ?? []), ...(b ?? [])]))),
    notes: mergeRecord("notes", local.notes, remote.notes, local.modified, remote.modified, (a, b) => b ?? a ?? ""),
    modified,
  } satisfies TrackerStore;
}


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
    cloud: <><path d="M17.5 19H6a4 4 0 0 1-.5-8A6.5 6.5 0 0 1 18 9.5 4.8 4.8 0 0 1 17.5 19Z" /><path d="m9 14 3-3 3 3M12 11v7" /></>,
    shield: <><path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z" /><path d="m9 12 2 2 4-5" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M15 8l3 3M17 6l2 2" /></>,
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

function AppButton({ children, icon, onClick, variant = "secondary", disabled = false, type = "button" }: { children: ReactNode; icon?: IconName; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger"; disabled?: boolean; type?: "button" | "submit" }) {
  return <button type={type} className={`app-button ${variant}`} onClick={onClick} disabled={disabled}>{icon && <Icon name={icon} size={17} />}{children}</button>;
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
  const [auth, setAuth] = useState<AuthState>({ checking: true, authenticated: false, setupRequired: false, username: "", error: "" });
  const [sessionToken, setSessionToken] = useState("");
  const [cloudVersion, setCloudVersion] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: "off", message: "ログイン待ち" });
  const [githubSettings, setGithubSettings] = useState<GitHubSettingsResult | null>(null);
  const [showToken, setShowToken] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const syncLock = useRef(false);
  const lastSyncedFingerprint = useRef("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          setStore(normalizeStore(JSON.parse(raw) as Partial<TrackerStore>));
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

  const loadCloud = useCallback(async (token: string, local: TrackerStore) => {
    const [identity, remote, settings] = await Promise.all([
      syncApi.me(token),
      syncApi.getData<TrackerStore>(token),
      syncApi.getGitHubSettings(token),
    ]);
    const normalizedRemote = normalizeStore(remote.data);
    const merged = mergeStores(local, normalizedRemote);
    setSessionToken(token);
    setCloudVersion(remote.version);
    setGithubSettings(settings);
    setStore(merged);
    lastSyncedFingerprint.current = JSON.stringify(normalizedRemote);
    setAuth({ checking: false, authenticated: true, setupRequired: false, username: identity.user.username, error: "" });
    setSyncStatus({ state: "success", message: "クラウド同期済み", lastSyncAt: new Date().toISOString() });
  }, [setAuth, setCloudVersion, setGithubSettings, setSessionToken, setStore, setSyncStatus]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const restoreSession = async () => {
      const token = window.localStorage.getItem(SESSION_KEY) ?? "";
      try {
        if (token) {
          await loadCloud(token, store);
          return;
        }
        const status = await syncApi.status();
        if (!cancelled) setAuth({ checking: false, authenticated: false, setupRequired: status.setupRequired, username: "", error: "" });
      } catch (error) {
        const status = (error as Error & { status?: number }).status;
        if (status === 401) window.localStorage.removeItem(SESSION_KEY);
        try {
          const setup = await syncApi.status();
          if (!cancelled) setAuth({ checking: false, authenticated: false, setupRequired: setup.setupRequired, username: "", error: status === 401 ? "セッションの期限が切れました。もう一度ログインしてください。" : "" });
        } catch {
          if (!cancelled) setAuth({ checking: false, authenticated: false, setupRequired: false, username: "", error: "同期サーバーに接続できません。通信環境を確認して再試行してください。" });
        }
      }
    };
    void restoreSession();
    return () => { cancelled = true; };
  // Initial local store must be captured once after hydration.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, loadCloud]);

  const uploadCloud = useCallback(async (force = false) => {
    if (!sessionToken || !auth.authenticated || syncLock.current) return;
    const fingerprint = JSON.stringify(store);
    if (!force && fingerprint === lastSyncedFingerprint.current) return;
    syncLock.current = true;
    setSyncStatus({ state: "syncing", message: "保存中…" });
    try {
      let candidate = store;
      let baseVersion = cloudVersion;
      try {
        const saved = await syncApi.putData<TrackerStore>(sessionToken, candidate, baseVersion);
        baseVersion = saved.version;
        candidate = normalizeStore(saved.data);
      } catch (error) {
        const conflict = error as Error & { status?: number; payload?: { data?: TrackerStore; version?: number } };
        if (conflict.status !== 409 || !conflict.payload) throw error;
        candidate = mergeStores(candidate, conflict.payload.data ?? emptyStore);
        const saved = await syncApi.putData<TrackerStore>(sessionToken, candidate, conflict.payload.version ?? 0);
        baseVersion = saved.version;
        candidate = normalizeStore(saved.data);
        setStore(candidate);
      }
      setCloudVersion(baseVersion);
      lastSyncedFingerprint.current = JSON.stringify(candidate);
      setSyncStatus({ state: "success", message: "クラウド同期済み", lastSyncAt: new Date().toISOString() });
    } catch (error) {
      if ((error as Error & { status?: number }).status === 401) {
        window.localStorage.removeItem(SESSION_KEY);
        setSessionToken("");
        setAuth((current) => ({ ...current, authenticated: false, error: "セッションの期限が切れました。再度ログインしてください。" }));
      }
      setSyncStatus({ state: "error", message: "未同期の変更があります" });
    } finally {
      syncLock.current = false;
    }
  }, [auth.authenticated, cloudVersion, sessionToken, store]);

  useEffect(() => {
    if (!hydrated || !auth.authenticated) return;
    const timer = window.setTimeout(() => void uploadCloud(), 1800);
    return () => window.clearTimeout(timer);
  }, [store, hydrated, auth.authenticated, uploadCloud]);

  const pullCloud = useCallback(async () => {
    if (!sessionToken || !auth.authenticated || syncLock.current) return;
    try {
      const remote = await syncApi.getData<TrackerStore>(sessionToken);
      const normalizedRemote = normalizeStore(remote.data);
      const merged = mergeStores(store, normalizedRemote);
      setCloudVersion(remote.version);
      lastSyncedFingerprint.current = JSON.stringify(normalizedRemote);
      if (JSON.stringify(merged) !== JSON.stringify(store)) setStore(merged);
      setSyncStatus({ state: "success", message: "クラウド同期済み", lastSyncAt: new Date().toISOString() });
    } catch {
      setSyncStatus({ state: "error", message: "同期を再試行してください" });
    }
  }, [auth.authenticated, sessionToken, store]);

  useEffect(() => {
    if (!auth.authenticated) return;
    const onFocus = () => void pullCloud();
    const onVisibility = () => { if (document.visibilityState === "visible") void pullCloud(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(onFocus, 60_000);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibility); window.clearInterval(interval); };
  }, [auth.authenticated, pullCloud]);

  async function completeAuthentication(result: AuthResult) {
    window.localStorage.setItem(SESSION_KEY, result.token);
    await loadCloud(result.token, store);
  }

  async function logout() {
    if (sessionToken) await syncApi.logout(sessionToken).catch(() => undefined);
    window.localStorage.removeItem(SESSION_KEY);
    setSessionToken("");
    const status = await syncApi.status().catch(() => ({ setupRequired: false }));
    setAuth({ checking: false, authenticated: false, setupRequired: status.setupRequired, username: "", error: "ログアウトしました。" });
    setSyncStatus({ state: "off", message: "ログイン待ち" });
  }

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
      modified: { ...current.modified, [`completed:${key}`]: Date.now() },
    }));
  }

  function setStep(iso: string, value: string) {
    const next = Math.min(200_000, Math.max(0, Number(value.replace(/[^0-9]/g, "")) || 0));
    setStore((current) => ({ ...current, steps: { ...current.steps, [iso]: next }, modified: { ...current.modified, [`steps:${iso}`]: Date.now() } }));
  }

  function addRecovery(task: PlanTask) {
    setStore((current) => {
      const assigned = current.recoveries[selectedDate] ?? [];
      if (assigned.includes(task.key)) return current;
      return { ...current, recoveries: { ...current.recoveries, [selectedDate]: [...assigned, task.key] }, modified: { ...current.modified, [`recoveries:${selectedDate}`]: Date.now() } };
    });
    setToast("今日のタスクにリカバリーを追加しました");
  }

  function removeRecovery(taskKey: string) {
    setStore((current) => ({
      ...current,
      recoveries: { ...current.recoveries, [selectedDate]: (current.recoveries[selectedDate] ?? []).filter((key) => key !== taskKey) },
      modified: { ...current.modified, [`recoveries:${selectedDate}`]: Date.now() },
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
      setStore(stampStore(data));
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

  if (!hydrated || auth.checking || !auth.authenticated) {
    return <AuthScreen auth={auth} onLogin={async (username, password) => completeAuthentication(await syncApi.login(username, password))} onRegister={async (username, password, setupCode) => completeAuthentication(await syncApi.register(username, password, setupCode))} onRetry={() => window.location.reload()} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="メインナビゲーション">
        <div className="brand"><strong>Harvey</strong><span>English<br />Career Tracker</span><small>18-MONTH<br />EXECUTIVE ENGLISH</small></div>
        <nav className="side-nav">
          {navItems.map((item) => <button key={item.id} type="button" className={activeSection === item.id ? "active" : ""} onClick={() => goToSection(item.id)}><Icon name={item.icon} /><span>{item.label}</span></button>)}
        </nav>
        <div className="sidebar-goal"><span>最終目標</span><strong>C1 / EXECUTIVE</strong><small>18ヶ月後の自分へ</small><button type="button" onClick={() => goToSection("resources")}>目標を確認 <Icon name="arrow" size={16} /></button></div>
        <div className="profile"><span className="avatar">H</span><span><strong>{auth.username}</strong><small>クラウド同期済み</small></span><button type="button" aria-label="データ管理を開く" onClick={() => setDataModal(true)}><Icon name="arrow" size={17} /></button></div>
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
            <button type="button" className={`sync-chip ${syncStatus.state}`} onClick={() => void uploadCloud(true)} title={syncStatus.message}><Icon name="cloud" size={17} /><span>{syncStatus.message}</span></button>
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
            <label className="daily-note"><span>今日のひと言メモ</span><textarea id="daily-note" value={store.notes[selectedDate] ?? ""} placeholder="できたこと、詰まった点、明日の一手…" onChange={(event) => setStore((current) => ({ ...current, notes: { ...current.notes, [selectedDate]: event.target.value }, modified: { ...current.modified, [`notes:${selectedDate}`]: Date.now() } }))} /></label>
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

      {dataModal && <div className="modal-backdrop" role="presentation" onMouseDown={() => setDataModal(false)}><section className="data-modal" role="dialog" aria-modal="true" aria-labelledby="data-modal-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="閉じる" onClick={() => setDataModal(false)}><Icon name="close" /></button><span className="eyebrow">DATA VAULT</span><h2 id="data-modal-title">記録データの管理</h2><p>記録はログイン中のクラウドへ自動保存され、Mac・Windows・iPhoneで同じ最新データを利用できます。ブラウザ内にも復旧用キャッシュを保持します。</p><div className="cloud-summary"><Icon name="shield" /><div><strong>{auth.username} として保護中</strong><span>{syncStatus.message}{syncStatus.lastSyncAt ? `・${new Date(syncStatus.lastSyncAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}` : ""}</span></div><AppButton icon="cloud" onClick={() => void uploadCloud(true)}>今すぐ同期</AppButton></div><GitHubBackupPanel token={sessionToken} initial={githubSettings} showToken={showToken} onToggleToken={() => setShowToken((value) => !value)} onUpdated={async () => setGithubSettings(await syncApi.getGitHubSettings(sessionToken))} onToast={setToast} /><div className="local-backup"><strong>手元にもバックアップ</strong><p>JSONは緊急時の持ち出し・復元用です。読み込んだ内容はクラウドにも反映されます。</p><div className="modal-actions"><AppButton icon="download" variant="primary" onClick={exportData}>JSONを書き出す</AppButton><AppButton icon="upload" onClick={() => fileRef.current?.click()}>JSONを読み込む</AppButton><input ref={fileRef} type="file" accept="application/json,.json" onChange={importData} hidden /><AppButton icon="copy" variant="ghost" onClick={copyReport}>進捗サマリーをコピー</AppButton></div></div><button className="logout-button" type="button" onClick={() => void logout()}>この端末からログアウト</button></section></div>}

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}

function AuthScreen({ auth, onLogin, onRegister, onRetry }: { auth: AuthState; onLogin: (username: string, password: string) => Promise<void>; onRegister: (username: string, password: string, setupCode: string) => Promise<void>; onRetry: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (auth.setupRequired && password !== confirm) { setError("確認用パスワードが一致しません。"); return; }
    setBusy(true);
    setError("");
    try {
      if (auth.setupRequired) await onRegister(username, password, setupCode);
      else await onLogin(username, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "認証に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-shell">
    <section className="auth-editorial">
      <div className="auth-brand"><strong>Harvey</strong><span>PRIVATE<br />PROGRESS VAULT</span></div>
      <div className="auth-number">18</div>
      <div className="auth-manifest"><span>MONTHS TO EXECUTIVE ENGLISH</span><h1>約束を、<br />毎日の証拠に。</h1><p>学習・資格・健康習慣をひとつの安全な場所へ。どの端末からでも、続きから。</p></div>
      <ul><li><Icon name="cloud" />端末間で自動同期</li><li><Icon name="shield" />パスワードはハッシュ化</li><li><Icon name="key" />GitHubパスワード不使用</li></ul>
    </section>
    <section className="auth-panel">
      <form className="auth-card" onSubmit={submit}>
        <span className="eyebrow">{auth.setupRequired ? "OWNER REGISTRATION" : "SECURE SIGN IN"}</span>
        <h2>{auth.checking ? "接続を確認中" : auth.setupRequired ? "専用アカウントを作成" : "おかえりなさい"}</h2>
        <p>{auth.setupRequired ? "この登録は最初の1回だけです。以後は作成したアカウントでログインできます。" : "このサイト専用のアカウント名とパスワードを入力してください。"}</p>
        {auth.checking ? <div className="auth-loading"><i /><span>暗号化された保管庫へ接続しています…</span></div> : <>
          <label className="auth-field"><span>アカウント名</span><input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="harvey" required minLength={3} /></label>
          <label className="auth-field"><span>パスワード</span><div className="password-field"><input type={visible ? "text" : "password"} autoComplete={auth.setupRequired ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="12文字以上" required minLength={12} /><button type="button" onClick={() => setVisible((value) => !value)}>{visible ? "隠す" : "表示"}</button></div>{auth.setupRequired && <small>大文字・小文字・数字を含む12文字以上</small>}</label>
          {auth.setupRequired && <><label className="auth-field"><span>パスワード（確認）</span><input type={visible ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required minLength={12} /></label><label className="auth-field"><span>初回セットアップコード</span><input value={setupCode} onChange={(event) => setSetupCode(event.target.value)} placeholder="別途発行されたコード" required /></label></>}
          {(error || auth.error) && <div className="auth-error" role="alert">{error || auth.error}</div>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? "確認しています…" : auth.setupRequired ? "保管庫を作成" : "ログイン"}<Icon name="arrow" /></button>
          {auth.error.includes("接続できません") && <button className="auth-retry" type="button" onClick={onRetry}>接続を再試行</button>}
          <small className="auth-footnote"><Icon name="shield" size={15} />GitHubのアカウント／パスワードは入力しません</small>
        </>}
      </form>
    </section>
  </main>;
}

function GitHubBackupPanel({ token, initial, showToken, onToggleToken, onUpdated, onToast }: { token: string; initial: GitHubSettingsResult | null; showToken: boolean; onToggleToken: () => void; onUpdated: () => Promise<void>; onToast: (message: string) => void }) {
  const current = initial?.settings;
  const [owner, setOwner] = useState(current?.owner ?? "harvey-shimizu");
  const [repo, setRepo] = useState(current?.repo ?? "harvey-tracker-data");
  const [branch, setBranch] = useState(current?.branch ?? "main");
  const [path, setPath] = useState(current?.path ?? "data/progress.json");
  const [githubToken, setGithubToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      await syncApi.saveGitHubSettings(token, { owner, repo, branch, path, ...(githubToken ? { token: githubToken } : {}) });
      setGithubToken(""); await onUpdated(); onToast("GitHubバックアップを設定しました");
    } catch (error) { onToast(error instanceof Error ? error.message : "GitHub設定を保存できませんでした"); }
    finally { setBusy(false); }
  }

  async function backup() {
    setBusy(true);
    try { await syncApi.backupNow(token); await onUpdated(); onToast("GitHubへバックアップしました"); }
    catch (error) { onToast(error instanceof Error ? error.message : "バックアップに失敗しました"); }
    finally { setBusy(false); }
  }

  return <form className="github-backup" onSubmit={save}><div className="github-heading"><div><span className="eyebrow">OPTIONAL DOUBLE BACKUP</span><strong>GitHubにも暗号化キー経由で保存</strong><small>{initial?.configured ? current?.last_backup_error ? `要確認：${current.last_backup_error}` : current?.last_backup_at ? `最終バックアップ ${new Date(current.last_backup_at).toLocaleString("ja-JP")}` : "設定済み・初回保存待ち" : "未設定"}</small></div><StatusPill tone={initial?.configured && !current?.last_backup_error ? "green" : "neutral"}>{initial?.configured ? "CONNECTED" : "OPTIONAL"}</StatusPill></div><div className="github-grid"><label><span>OWNER</span><input value={owner} onChange={(event) => setOwner(event.target.value)} required /></label><label><span>PRIVATE REPOSITORY</span><input value={repo} onChange={(event) => setRepo(event.target.value)} required /></label><label><span>BRANCH</span><input value={branch} onChange={(event) => setBranch(event.target.value)} required /></label><label><span>FILE PATH</span><input value={path} onChange={(event) => setPath(event.target.value)} required /></label></div><label className="github-token"><span>Fine-grained access token {initial?.configured && "（変更時のみ）"}</span><div><input type={showToken ? "text" : "password"} value={githubToken} onChange={(event) => setGithubToken(event.target.value)} placeholder={initial?.configured ? "保存済み" : "github_pat_…"} required={!initial?.configured} /><button type="button" onClick={onToggleToken}>{showToken ? "隠す" : "表示"}</button></div><small>専用の非公開リポジトリに対する Contents: Read and write のみを付与。保存キーはサーバー側で暗号化します。</small></label><div className="github-actions"><AppButton icon="key" variant="primary" type="submit" disabled={busy}>{busy ? "処理中…" : "設定を保存"}</AppButton>{initial?.configured && <AppButton icon="cloud" onClick={() => void backup()} disabled={busy}>今すぐGitHubへ保存</AppButton>}</div></form>;
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
