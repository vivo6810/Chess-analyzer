'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import GameReplay from '@/components/game-replay';
import { analysisId, listAnalyses, loadAnalysisPgn, rememberAnalysis, rememberProfile, type AnalysisEntry } from '@/lib/local-user';
import { parsePgn, PgnError, renderPgn, type ParsedGame } from '@/lib/pgn';

type ChessComGame = {
  end_time?: number;
  time_class?: string;
  time_control?: string;
  pgn?: string;
  result: string;
  white?: { username?: string; rating?: number };
  black?: { username?: string; rating?: number };
};
type ChessComPayload = {
  error?: string;
  profile?: {
    username: string;
    name: string;
    avatar: string | null;
    joined: number | null;
    ratings: Record<string, number | null>;
  };
  games?: ChessComGame[];
};
type SelectedGame = { parsed: ParsedGame; pgn: string; id: string; whiteRating?: number; blackRating?: number; source: 'chesscom' | 'pgn' | 'play'; profile?: string };

const EXAMPLE = '[White "You"]\n[Black "Example"]\n[Result "1/2-1/2"]\n\n1. e4 e5 2. Nf3 Nc6 1/2-1/2';

function oneGamePgn(game: ParsedGame): string {
  const headers: Record<string, string> = { White: game.white, Black: game.black };
  if (game.eventName) headers.Event = game.eventName;
  if (game.site) headers.Site = game.site;
  if (game.playedAt) headers.Date = game.playedAt;
  if (game.timeControl) headers.TimeControl = game.timeControl;
  return renderPgn(headers, game.moves, game.result);
}

export default function AnalysisPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'chesscom' | 'pgn'>('chesscom');
  const [username, setUsername] = useState('');
  const [payload, setPayload] = useState<ChessComPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pgn, setPgn] = useState('');
  const [parsedGames, setParsedGames] = useState<ParsedGame[]>([]);
  const [selected, setSelected] = useState<SelectedGame | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisEntry[]>([]);
  const [didMount, setDidMount] = useState(false);

  useEffect(() => {
    setDidMount(true);
    setAnalyses(listAnalyses());
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get('u');
    if (prefill) setUsername(prefill);
    let handoff: string | null = null;
    let handoffUnavailable = false;
    try {
      handoff = sessionStorage.getItem('arbiter:handoff-pgn');
      if (handoff) sessionStorage.removeItem('arbiter:handoff-pgn');
    } catch {
      handoffUnavailable = true;
    }
    if (handoff) {
      setTab('pgn');
      setPgn(handoff);
      loadPgn(handoff, 'play');
    } else {
      const savedId = params.get('game');
      const savedPgn = savedId ? loadAnalysisPgn(savedId) : null;
      if (savedPgn) {
        setTab('pgn');
        setPgn(savedPgn);
        loadPgn(savedPgn, 'play');
      } else if (savedId) {
        setError('The played game could not be found in this browser.');
      } else if (handoffUnavailable) {
        setError('The play-to-analysis handoff is unavailable in this browser.');
      }
    }
  }, []);

  const refreshHistory = () => setAnalyses(listAnalyses());

  function selectParsed(game: ParsedGame, raw: string, source: SelectedGame['source'], profile?: string, whiteRating?: number, blackRating?: number) {
    const id = analysisId(`${game.white}|${game.black}|${game.result}|${raw}`);
    const next: SelectedGame = { parsed: game, pgn: raw, id, source, profile, whiteRating, blackRating };
    setSelected(next);
    rememberAnalysis({
      id,
      source,
      white: game.white,
      black: game.black,
      result: game.result,
      played: game.playedAt ?? undefined,
      profile,
    }, raw);
    refreshHistory();
    return id;
  }

  function loadPgn(raw: string, source: SelectedGame['source'] = 'pgn') {
    setError(null);
    try {
      const games = parsePgn(raw);
      setParsedGames(games);
      selectParsed(games[0], games.length === 1 ? raw : oneGamePgn(games[0]), source);
    } catch (caught) {
      setError(caught instanceof PgnError ? caught.message : 'The PGN could not be read.');
      setParsedGames([]);
      setSelected(null);
    }
  }

  async function searchChessCom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = username.trim();
    if (!name) return;
    setLoading(true);
    setError(null);
    setPayload(null);
    setSelected(null);
    try {
      const response = await fetch(`/api/chesscom/${encodeURIComponent(name)}`);
      const body = await response.json() as ChessComPayload;
      if (!response.ok) throw new Error(body.error ?? 'Chess.com could not be reached.');
      setPayload(body);
      if (body.profile) rememberProfile(name, body.profile.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chess.com could not be reached.');
    } finally {
      setLoading(false);
    }
  }

  function openChessComGame(game: ChessComGame) {
    if (!game.pgn) {
      setError('This game has no PGN available.');
      return;
    }
    try {
      const parsed = parsePgn(game.pgn)[0];
      const id = selectParsed(
        parsed,
        game.pgn,
        'chesscom',
        payload?.profile?.username ?? username.trim().toLowerCase(),
        game.white?.rating,
        game.black?.rating,
      );
      try {
        sessionStorage.setItem(`arbiter:analysis-pgn:${id}`, game.pgn);
      } catch {
        if (!loadAnalysisPgn(id)) {
          setError('Browser storage is unavailable, so this game cannot be opened for analysis.');
          return;
        }
      }
      const ratings = new URLSearchParams();
      if (game.white?.rating != null) ratings.set('whiteRating', String(game.white.rating));
      if (game.black?.rating != null) ratings.set('blackRating', String(game.black.rating));
      router.push(`/analysis/${id}${ratings.size ? `?${ratings}` : ''}`);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This game could not be parsed.');
    }
  }

  function openHistory(entry: AnalysisEntry) {
    const saved = loadAnalysisPgn(entry.id);
    if (!saved) {
      setError('This entry is details only; its PGN was too large to store in a cookie.');
      return;
    }
    setTab('pgn');
    setPgn(saved);
    loadPgn(saved, entry.source);
  }

  const profile = payload?.profile;
  const heading = profile?.name ?? username;

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
      <header className="mb-8 max-w-3xl">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Game review</p>
        <h1 className="mt-3 text-[clamp(2.2rem,5vw,3.7rem)] leading-none font-extrabold tracking-[-0.045em] text-ink">Analyze a game.</h1>
        <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-ink-soft">Find a public Chess.com game or bring your own PGN. The review runs locally in your browser.</p>
      </header>

      <div role="tablist" aria-label="Game source" className="mb-6 flex border-b-2 border-ink">
        {(['chesscom', 'pgn'] as const).map((value) => (
          <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`border-2 border-b-0 border-ink px-5 py-3 text-[13px] font-bold ${tab === value ? 'bg-ink text-canvas' : 'bg-surface text-ink hover:bg-bone'}`}>
            {value === 'chesscom' ? 'Chess.com' : 'PGN'}
          </button>
        ))}
      </div>

      {tab === 'chesscom' ? (
        <section className="mb-8 space-y-5">
          <form onSubmit={searchChessCom} className="flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="chesscom-username">Chess.com username</label>
            <input id="chesscom-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Chess.com username" className="field min-h-12 flex-1 px-4" autoComplete="off" />
            <button type="submit" disabled={loading} className="press min-h-12 border-2 border-ink bg-accent px-6 font-bold text-on-accent shadow-brut disabled:opacity-50">{loading ? 'Loading games…' : 'Find games'}</button>
          </form>
          {loading ? <div aria-label="Loading games" className="space-y-2">{[1, 2, 3].map((row) => <div key={row} className="h-16 animate-pulse border-2 border-line bg-surface" />)}</div> : null}
          {profile ? (
            <section className="flex flex-wrap items-center gap-4 border-2 border-ink bg-surface p-4 shadow-brut-sm">
              {profile.avatar ? <img src={profile.avatar} alt="" className="h-14 w-14 border-2 border-line object-cover" /> : <div aria-hidden className="h-14 w-14 border-2 border-line bg-bone" />}
              <div className="min-w-44 flex-1">
                <h2 className="text-lg font-bold text-ink">{profile.name}</h2>
                <p className="text-[12px] text-muted">@{profile.username}{profile.joined ? ` · joined ${new Date(profile.joined * 1000).getFullYear()}` : ''}</p>
              </div>
              <div className="flex flex-wrap gap-2">{Object.entries(profile.ratings).map(([mode, rating]) => <span key={mode} className="badge bg-bone text-ink">{mode} {rating ?? '—'}</span>)}</div>
            </section>
          ) : null}
          {payload?.games?.length === 0 ? <p className="border-2 border-line bg-surface px-4 py-5 text-sm text-muted">No games in the requested recent window.</p> : null}
          {payload?.games?.length ? (
            <div className="grid gap-2">
              {payload.games.map((game, index) => {
                const user = profile?.username.toLowerCase();
                const isWhite = game.white?.username?.toLowerCase() === user;
                const opponent = isWhite ? game.black?.username : game.white?.username;
                const ownResult = isWhite ? game.result === '1-0' ? 'win' : game.result === '0-1' ? 'loss' : 'draw' : game.result === '0-1' ? 'win' : game.result === '1-0' ? 'loss' : 'draw';
                return (
                  <button key={`${game.end_time ?? index}-${index}`} type="button" onClick={() => openChessComGame(game)} className="grid grid-cols-[1fr_auto] items-center gap-3 border-2 border-line bg-surface px-4 py-3 text-left hover:border-ink sm:grid-cols-[1fr_auto_auto_auto]">
                    <span className="min-w-0"><strong className="block truncate text-[14px] text-ink">vs {opponent ?? 'Opponent'}</strong><span className="text-[11px] text-muted">{game.end_time ? new Date(game.end_time * 1000).toLocaleDateString() : 'Date unknown'}</span></span>
                    <span className={`badge ${ownResult === 'win' ? 'bg-win-bg text-win-fg' : ownResult === 'loss' ? 'bg-loss-bg text-loss-fg' : 'bg-draw-bg text-draw-fg'}`}>{ownResult}</span>
                    <span className="badge bg-bone text-ink">{game.time_class ?? 'chess'}</span>
                    <span className="font-mono text-[11px] text-muted">{game.white?.rating ?? '—'} – {game.black?.rating ?? '—'}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : (
        <section className="mb-8 space-y-3">
          <label htmlFor="pgn-input" className="field-label">Paste a PGN</label>
          <textarea id="pgn-input" value={pgn} onChange={(event) => setPgn(event.target.value)} rows={9} placeholder={'[White "Player"]\n[Black "Opponent"]\n\n1. e4 e5 2. Nf3 Nc6'} className="field w-full p-4 font-mono text-[13px]" />
          <div className="flex flex-wrap gap-3">
            <label className="press inline-flex min-h-11 cursor-pointer items-center border-2 border-line-strong bg-surface px-4 text-[13px] font-bold text-ink hover:bg-bone">Upload PGN<input type="file" accept=".pgn,.txt" className="sr-only" onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) {
                const text = await file.text();
                setPgn(text);
                loadPgn(text);
              }
            }} /></label>
            <button type="button" onClick={() => { setPgn(EXAMPLE); loadPgn(EXAMPLE); }} className="press min-h-11 border-2 border-line-strong bg-surface px-4 text-[13px] font-bold text-ink hover:bg-bone">Load example</button>
            <button type="button" onClick={() => loadPgn(pgn)} className="press min-h-11 border-2 border-ink bg-accent px-5 text-[13px] font-bold text-on-accent shadow-brut-sm">Parse PGN</button>
          </div>
          {parsedGames.length > 1 ? <div className="grid gap-2">{parsedGames.map((game, index) => <button type="button" key={`${game.white}-${index}`} onClick={() => selectParsed(game, oneGamePgn(game), 'pgn')} className="border-2 border-line bg-surface px-4 py-3 text-left text-[13px] font-semibold text-ink hover:border-ink">Game {index + 1} — {game.white} vs {game.black} ({game.result})</button>)}</div> : null}
        </section>
      )}

      {error ? <p role="alert" className="mb-6 border-2 border-loss-fg bg-loss-bg px-4 py-3 text-[13px] text-loss-fg">{error}</p> : null}
      {selected ? (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-3">
            <div><p className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">{selected.parsed.opening ?? 'Game analysis'}{selected.parsed.playedAt ? ` · ${selected.parsed.playedAt}` : ''}</p><h2 className="mt-1 text-xl font-bold text-ink">{selected.parsed.white} vs {selected.parsed.black}</h2></div>
            <p className="font-mono text-sm font-bold text-ink">{selected.parsed.result}</p>
          </div>
          <GameReplay
            gameId={selected.id}
            startFen={selected.parsed.startFen}
            moves={selected.parsed.moves}
            result={selected.parsed.result}
            pgn={selected.pgn}
            white={selected.parsed.white}
            black={selected.parsed.black}
            whiteRating={selected.whiteRating}
            blackRating={selected.blackRating}
            timeControl={selected.parsed.timeControl}
          />
        </section>
      ) : null}

      <section className="mt-12 border-t-2 border-ink pt-5">
        <h2 className="text-[13px] font-bold text-ink">Recent analysis</h2>
        {!didMount ? <p className="mt-2 text-[12px] text-muted">Loading browser history…</p> : analyses.length === 0 ? <p className="mt-2 text-[12px] text-muted">Games you analyze will be remembered in this browser.</p> : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{analyses.map((entry) => <li key={entry.id}><button type="button" onClick={() => openHistory(entry)} className="w-full border-2 border-line bg-surface px-3 py-3 text-left hover:border-ink"><span className="block truncate text-[13px] font-bold text-ink">{entry.white} vs {entry.black}</span><span className="font-mono text-[11px] text-muted">{entry.result} · {entry.stored ? entry.source : 'details only'}</span></button></li>)}</ul>
        )}
      </section>
    </div>
  );
}
