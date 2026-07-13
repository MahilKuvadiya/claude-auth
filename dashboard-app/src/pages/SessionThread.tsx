import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchSessionThread } from '../api';
import { GlassPanel, Card, Skeleton, ErrorState } from '../components/glass';
import type { SessionMessage } from '../types';

const when = (s?: string | null) => (s ? new Date(s).toLocaleString() : '');

export function SessionThread() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['session', id], queryFn: () => fetchSessionThread(id) });

  return (
    <>
      <GlassPanel className="mb-4 flex items-center gap-3 p-[14px_18px]" spec={false}>
        <Link to="/sessions" className="text-[.82rem] text-ink-faint no-underline hover:text-white">← Sessions</Link>
        <span className="flex-1" />
        {q.data && <span className="text-[.78rem] text-ink-faint">{q.data.messages.length} messages</span>}
      </GlassPanel>

      {q.error && <ErrorState error={(q.error as Error).message} retry={q.refetch} />}
      {q.isLoading && <GlassPanel className="p-[18px]"><Skeleton h={320} /></GlassPanel>}

      {q.data && (
        <>
          <Card className="mb-4">
            <div className="text-[.95rem] font-semibold text-ink">{q.data.session.userEmail}</div>
            <div className="mt-1 text-[.78rem] text-ink-faint">
              {q.data.session.project ?? '—'} · {q.data.session.gitBranch ?? 'no branch'} · {q.data.session.model ?? '—'} · {when(q.data.session.startedAt)}
            </div>
          </Card>
          <div className="flex flex-col gap-3">
            {q.data.messages.map((m) => <MessageBubble key={m.uuid} m={m} />)}
          </div>
        </>
      )}
    </>
  );
}

function MessageBubble({ m }: { m: SessionMessage }) {
  const [showThinking, setShowThinking] = useState(false);
  const isUser = m.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl p-[12px_15px] ${isUser ? 'bg-[var(--accent-wash)]' : 'bg-[var(--surface)]'} border border-hairline`}>
        <div className="mb-1 flex items-center gap-2 text-[.68rem] uppercase tracking-wide text-ink-faint">
          <span>{isUser ? 'User' : 'Assistant'}</span>
          {m.isSidechain && <span className="rounded bg-[var(--hairline)] px-1">sidechain</span>}
          {m.model && <span className="font-mono lowercase">{m.model}</span>}
          {when(m.ts) && <span>· {when(m.ts)}</span>}
        </div>
        {m.thinking && (
          <div className="mb-2">
            <button onClick={() => setShowThinking((s) => !s)} className="text-[.72rem] text-ink-faint">
              {showThinking ? '▾ hide thinking' : '▸ show thinking'}
            </button>
            {showThinking && (
              <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-[var(--bg)] p-2 text-[.78rem] text-ink-soft">{m.thinking}</pre>
            )}
          </div>
        )}
        {m.text && <div className="whitespace-pre-wrap break-words text-[.88rem] text-ink">{m.text}</div>}
        {m.toolNames.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {m.toolNames.map((t, i) => (
              <span key={i} className="rounded bg-[var(--hairline)] px-[6px] py-[2px] font-mono text-[.7rem] text-ink-soft">{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
