"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { syncApi, type BookSearchResult } from "../sync-api";
import { addDays, dateLabel, diffDays, todayInJapan, weekStart } from "../plan";
import styles from "./reading.module.css";

const SESSION_KEY = "harvey-tracker-session-v1";

type CurrentBook = BookSearchResult & { startedAt: string };
type FinishedBook = CurrentBook & { finishedAt: string; readDays: number };
type ReadingState = { current: CurrentBook[]; daily: Record<string, boolean>; finished: FinishedBook[] };
type ApiError = Error & { status?: number; payload?: { data?: ReadingState; version?: number } };
type PeriodMode = "week" | "month" | "year";
type PeriodRecord = { key: string; label: string; start: string; end: string; completed: number; eligible: number; percent: number };

const emptyState: ReadingState = { current: [], daily: {}, finished: [] };

function normalizeReading(value?: Partial<ReadingState> & { current?: CurrentBook[] | CurrentBook | null }): ReadingState {
  const current = Array.isArray(value?.current) ? value.current : value?.current ? [value.current] : [];
  return { current, daily: value?.daily ?? {}, finished: value?.finished ?? [] };
}

function mergeReading(local: ReadingState, remote: ReadingState): ReadingState {
  const finished = [...remote.finished];
  for (const book of local.finished) if (!finished.some((item) => item.id === book.id && item.finishedAt === book.finishedAt)) finished.push(book);
  const current = [...remote.current];
  for (const book of local.current) if (!current.some((item) => item.id === book.id && item.startedAt === book.startedAt)) current.push(book);
  const finishedIds = new Set(finished.map((book) => `${book.id}:${book.startedAt}`));
  return { current: current.filter((book) => !finishedIds.has(`${book.id}:${book.startedAt}`)), daily: { ...remote.daily, ...local.daily }, finished: finished.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)) };
}

function endOfMonth(iso: string) {
  const date = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}

function periodBounds(iso: string, mode: PeriodMode) {
  if (mode === "week") { const start = weekStart(iso); return { key: start, start, end: addDays(start, 6), label: `${start.slice(5).replace("-", "/")}–${addDays(start, 6).slice(5).replace("-", "/")}` }; }
  if (mode === "month") { const start = `${iso.slice(0, 7)}-01`; return { key: iso.slice(0, 7), start, end: endOfMonth(start), label: `${iso.slice(0, 4)}年${Number(iso.slice(5, 7))}月` }; }
  const start = `${iso.slice(0, 4)}-01-01`; return { key: iso.slice(0, 4), start, end: `${iso.slice(0, 4)}-12-31`, label: `${iso.slice(0, 4)}年` };
}

function addPeriod(iso: string, mode: PeriodMode) {
  if (mode === "week") return addDays(iso, 7);
  const date = new Date(`${iso}T00:00:00Z`);
  if (mode === "month") date.setUTCMonth(date.getUTCMonth() + 1, 1);
  else date.setUTCFullYear(date.getUTCFullYear() + 1, 0, 1);
  return date.toISOString().slice(0, 10);
}

function periodRecords(readDates: string[], today: string, mode: PeriodMode): PeriodRecord[] {
  const first = readDates[0] ?? today;
  let cursor = periodBounds(first, mode).start;
  const records: PeriodRecord[] = [];
  while (cursor <= today) {
    const bounds = periodBounds(cursor, mode);
    const effectiveStart = bounds.start < first ? first : bounds.start;
    const effectiveEnd = bounds.end > today ? today : bounds.end;
    const eligible = Math.max(1, diffDays(effectiveStart, effectiveEnd) + 1);
    const completed = readDates.filter((date) => date >= effectiveStart && date <= effectiveEnd).length;
    records.push({ ...bounds, completed, eligible, percent: Math.round((completed / eligible) * 100) });
    cursor = addPeriod(bounds.start, mode);
  }
  return records.reverse();
}

function longestRun(readDates: string[]) {
  let longest = 0; let current = 0; let previous = "";
  for (const date of readDates) { current = previous && addDays(previous, 1) === date ? current + 1 : 1; longest = Math.max(longest, current); previous = date; }
  return longest;
}

export default function ReadingClient() {
  const today = todayInJapan();
  const [token] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem(SESSION_KEY) ?? "");
  const [state, setState] = useState<ReadingState>(emptyState);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("week");

  useEffect(() => {
    if (!token) { window.location.assign("/"); return; }
    void Promise.all([syncApi.me(token), syncApi.getReading<ReadingState>(token)])
      .then(([, reading]) => { setState(normalizeReading(reading.data)); setVersion(reading.version); })
      .catch(() => { window.localStorage.removeItem(SESSION_KEY); window.location.assign("/"); })
      .finally(() => setLoading(false));
  }, [token]);

  const readDates = useMemo(() => Object.keys(state.daily).filter((date) => state.daily[date]).sort(), [state.daily]);
  const streak = useMemo(() => {
    let count = 0;
    let cursor = state.daily[today] ? today : addDays(today, -1);
    while (state.daily[cursor]) { count += 1; cursor = addDays(cursor, -1); }
    return count;
  }, [state.daily, today]);
  const monthCount = readDates.filter((date) => date.slice(0, 7) === today.slice(0, 7)).length;
  const longest = useMemo(() => longestRun(readDates), [readDates]);
  const records = useMemo(() => periodRecords(readDates, today, periodMode), [periodMode, readDates, today]);
  const bestRecord = records.reduce<PeriodRecord | null>((best, record) => !best || record.percent > best.percent ? record : best, null);
  const currentRecord = records[0];
  const medals = [
    { id: "first", icon: "Ⅰ", name: "FIRST PAGE", detail: "最初の読書日", earned: readDates.length >= 1 },
    { id: "week", icon: "7", name: "SEVEN DAYS", detail: "7日連続", earned: longest >= 7 },
    { id: "perfect", icon: "100", name: "PERFECT WEEK", detail: "週間達成率100%", earned: periodRecords(readDates, today, "week").some((record) => record.eligible === 7 && record.percent === 100) },
    { id: "month", icon: "20", name: "MONTHLY READER", detail: "1か月で20日", earned: periodRecords(readDates, today, "month").some((record) => record.completed >= 20) },
    { id: "finish", icon: "✓", name: "BOOK FINISHER", detail: "最初の1冊を読了", earned: state.finished.length >= 1 },
    { id: "five", icon: "Ⅴ", name: "FIVE BOOKS", detail: "5冊読了", earned: state.finished.length >= 5 },
    { id: "year", icon: "365", name: "YEAR OF READING", detail: "年間200日読書", earned: periodRecords(readDates, today, "year").some((record) => record.completed >= 200) },
  ];

  async function saveReading(next: ReadingState) {
    if (!token) return;
    setSaving(true); setMessage("");
    try {
      let saved;
      try { saved = await syncApi.putReading(token, next, version); }
      catch (caught) {
        const conflict = caught as ApiError;
        if (conflict.status !== 409 || !conflict.payload) throw caught;
        const merged = mergeReading(next, conflict.payload.data ?? emptyState);
        saved = await syncApi.putReading(token, merged, conflict.payload.version ?? 0);
      }
      setState(normalizeReading(saved.data)); setVersion(saved.version); setMessage("クラウドに保存しました");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "保存できませんでした"); }
    finally { setSaving(false); }
  }

  async function syncDashboardReading(done: boolean) {
    try {
      const tracker = await syncApi.getData<Record<string, unknown> & { completed?: Record<string, boolean>; modified?: Record<string, number> }>(token);
      const key = `${today}:reading`;
      const data = { ...tracker.data, completed: { ...(tracker.data.completed ?? {}), [key]: done }, modified: { ...(tracker.data.modified ?? {}), [`completed:${key}`]: Date.now() } };
      try { await syncApi.putData(token, data, tracker.version); }
      catch (caught) {
        const conflict = caught as Error & { status?: number; payload?: { data?: typeof data; version?: number } };
        if (conflict.status === 409 && conflict.payload) await syncApi.putData(token, { ...(conflict.payload.data ?? {}), completed: { ...(conflict.payload.data?.completed ?? {}), [key]: done }, modified: { ...(conflict.payload.data?.modified ?? {}), [`completed:${key}`]: Date.now() } }, conflict.payload.version ?? 0);
      }
    } catch { /* Reading record remains authoritative if dashboard mirroring is temporarily unavailable. */ }
  }

  async function markToday() {
    if (!state.current.length) { setMessage("先に、現在読む本を登録してください"); return; }
    if (state.daily[today]) { setMessage("今日の読書は記録済みです"); return; }
    await saveReading({ ...state, daily: { ...state.daily, [today]: true } });
    await syncDashboardReading(true);
  }

  async function search(event: FormEvent) {
    event.preventDefault(); if (query.trim().length < 2) return;
    setSearching(true); setMessage("");
    try { const response = await syncApi.searchBooks(token, query.trim()); setResults(response.books); if (!response.books.length) setMessage("一致する書誌が見つかりません。タイトルだけで開始できます。"); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "検索できませんでした"); }
    finally { setSearching(false); }
  }

  async function startBook(book: BookSearchResult) {
    if (state.current.some((item) => item.id === book.id)) { setMessage("この本はすでに読書中です"); return; }
    await saveReading({ ...state, current: [...state.current, { ...book, startedAt: today }] });
    setResults([]); setQuery("");
  }

  async function finishBook(book: CurrentBook) {
    const readDays = readDates.filter((date) => date >= book.startedAt && date <= today).length;
    await saveReading({ ...state, current: state.current.filter((item) => !(item.id === book.id && item.startedAt === book.startedAt)), finished: [{ ...book, finishedAt: today, readDays }, ...state.finished] });
  }

  if (loading) return <main className={styles.loading}><i /><span>READING ARCHIVEを開いています…</span></main>;

  return <main className={styles.shell}>
    <header className={styles.header}><Link href="/" className={styles.brand}>Harvey <span>Reading Archive</span></Link><div className={styles.headerMeta}><span>{dateLabel(today)}</span><strong>{saving ? "保存中…" : "CLOUD SYNC"}</strong></div></header>
    <section className={styles.hero}>
      <div className={styles.heroCopy}><span className={styles.eyebrow}>DAILY READING PRACTICE</span><h1>数ページでも、<br />今日は読んだ。</h1><p>量ではなく、毎日本を開いた事実を残す。読了した本は、あなたの思考のアーカイブになります。</p></div>
      <div className={styles.stats}><article><strong>{streak}</strong><span>DAY STREAK</span></article><article><strong>{monthCount}</strong><span>THIS MONTH</span></article><article><strong>{state.finished.length}</strong><span>FINISHED</span></article></div>
    </section>

    <section className={styles.mainGrid}>
      <article className={styles.currentCard}>
        <div className={styles.sectionTitle}><div><span>NOW READING / {String(state.current.length).padStart(2, "0")}</span><h2>現在読んでいる本</h2></div><em>PARALLEL READING</em></div>
        {state.current.length ? <div className={styles.currentBooks}>{state.current.map((book) => <div className={styles.currentBook} key={`${book.id}:${book.startedAt}`}><BookCover book={book} large /><div className={styles.bookInfo}><span className={styles.readingLabel}>IN PROGRESS ・ {book.startedAt.replaceAll("-", ".")}</span><h3>{book.title}</h3><p>{book.authors.join(" / ") || "著者情報なし"}</p><dl><div><dt>出版社</dt><dd>{book.publisher ?? "情報なし"}</dd></div><div><dt>ページ数</dt><dd>{book.pageCount ? `${book.pageCount} pages` : "情報なし"}</dd></div></dl><button className={`${styles.readButton} ${state.daily[today] ? styles.done : ""}`} type="button" onClick={() => void markToday()} disabled={saving}><span>{state.daily[today] ? "✓" : ""}</span>{state.daily[today] ? "今日は読んだ" : "この本を数ページ読んだ"}</button><button className={styles.finishButton} type="button" onClick={() => void finishBook(book)} disabled={saving}>この本だけを読み終えた →</button></div></div>)}</div> : <div className={styles.emptyCurrent}><span>NO BOOK / 000</span><h3>次の一冊を登録しましょう</h3><p>複数冊を同時に登録できます。下の検索欄から、読みかけの本をすべて追加してください。</p></div>}
      </article>

      <aside className={styles.calendarCard}><div className={styles.sectionTitle}><div><span>CONSISTENCY</span><h2>最近28日</h2></div></div><div className={styles.dayGrid}>{Array.from({ length: 28 }, (_, index) => addDays(today, index - 27)).map((date) => <div key={date} className={state.daily[date] ? styles.readDay : ""} title={`${date}${state.daily[date] ? " 読書済み" : ""}`}><i /><span>{Number(date.slice(8))}</span></div>)}</div><p>一行でも数ページでも、読めばその日は達成です。</p></aside>
    </section>

    <section className={styles.searchSection}><div className={styles.sectionTitle}><div><span>ADD ANOTHER BOOK</span><h2>本を検索して追加</h2></div><em>Source: 国立国会図書館サーチ / Open Library</em></div><form className={styles.searchForm} onSubmit={search}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="本のタイトルを入力（日本語・英語）" aria-label="本のタイトル" /><button type="submit" disabled={searching}>{searching ? "検索中…" : "書誌を検索"}</button></form>{results.length > 0 && <div className={styles.results}>{results.map((book) => <article key={book.id}><BookCover book={book} /><div><h3>{book.title}</h3><p>{book.authors.join(" / ") || "著者情報なし"}</p><span>{book.publisher ?? "出版社情報なし"} ・ {book.pageCount ? `${book.pageCount}ページ` : "ページ数不明"}</span></div><button type="button" onClick={() => void startBook(book)}>読書中に追加</button></article>)}</div>}{query.trim().length >= 2 && <button className={styles.manualStart} type="button" onClick={() => void startBook({ id: `manual:${Date.now()}`, title: query.trim(), authors: [], publisher: null, pageCount: null, coverUrl: null, sourceUrl: "", isbn: null })}>見つからない場合：「{query.trim()}」として追加</button>}</section>

    <section className={styles.archive}><div className={styles.archiveHeading}><div><span className={styles.eyebrow}>FINISHED SHELF</span><h2>読了アーカイブ</h2></div><strong>{String(state.finished.length).padStart(2, "0")}</strong></div>{state.finished.length ? <div className={styles.shelf}>{state.finished.map((book, index) => <article key={`${book.id}:${book.finishedAt}:${index}`}><span className={styles.archiveIndex}>{String(state.finished.length - index).padStart(3, "0")}</span><BookCover book={book} /><div><em>FINISHED {book.finishedAt.replaceAll("-", ".")}</em><h3>{book.title}</h3><p>{book.authors.join(" / ") || "著者情報なし"}</p><span>{book.publisher ?? "出版社情報なし"} ・ {book.pageCount ? `${book.pageCount} pages` : "ページ数不明"} ・ {book.readDays} reading days</span></div></article>)}</div> : <div className={styles.emptyArchive}>最初の読了本が、ここに美しく並びます。</div>}</section>

    <section className={styles.analytics}><div className={styles.analyticsHeading}><div><span className={styles.eyebrow}>LONG-TERM RECORD</span><h2>読書の記録</h2></div><div className={styles.periodTabs}>{(["week", "month", "year"] as PeriodMode[]).map((mode) => <button type="button" key={mode} className={periodMode === mode ? styles.activeTab : ""} onClick={() => setPeriodMode(mode)}>{mode === "week" ? "週" : mode === "month" ? "月" : "年"}</button>)}</div></div><div className={styles.recordKpis}><article><span>CURRENT RATE</span><strong>{currentRecord?.percent ?? 0}<em>%</em></strong><small>{currentRecord?.completed ?? 0} / {currentRecord?.eligible ?? 1} days</small></article><article><span>PERSONAL BEST</span><strong>{bestRecord?.percent ?? 0}<em>%</em></strong><small>{bestRecord?.label ?? "記録待ち"}</small></article><article><span>LONGEST STREAK</span><strong>{longest}<em>日</em></strong><small>現在 {streak}日連続</small></article></div><div className={styles.recordList}>{records.slice(0, 12).map((record, index) => <article key={record.key}><span>{record.label}</span><div><i style={{ width: `${record.percent}%` }} /></div><strong>{record.percent}%</strong><small>{record.completed}/{record.eligible}日</small>{index === records.findIndex((item) => item.key === bestRecord?.key) && <em>BEST</em>}</article>)}</div></section>

    <section className={styles.medals}><div className={styles.medalsHeading}><div><span className={styles.eyebrow}>ACHIEVEMENT MEDALS</span><h2>獲得メダル</h2></div><strong>{medals.filter((medal) => medal.earned).length} / {medals.length}</strong></div><div className={styles.medalGrid}>{medals.map((medal) => <article key={medal.id} className={medal.earned ? styles.earnedMedal : styles.lockedMedal}><div><span>{medal.icon}</span></div><strong>{medal.name}</strong><small>{medal.earned ? "獲得済み" : medal.detail}</small></article>)}</div></section>
    {message && <div className={styles.toast}>{message}</div>}
  </main>;
}

function BookCover({ book, large = false }: { book: Pick<BookSearchResult, "coverUrl" | "title">; large?: boolean }) {
  return <div className={`${styles.cover} ${large ? styles.coverLarge : ""}`} style={book.coverUrl ? { backgroundImage: `url("${book.coverUrl.replaceAll('"', "")}")` } : undefined}><span>{book.coverUrl ? "" : book.title.slice(0, 1)}</span></div>;
}
