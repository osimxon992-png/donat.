'use client';

import { useState, type FormEvent } from 'react';
import { ErrorBox, Spinner } from './ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useAction } from '@/lib/hooks';

export interface TicketDetail {
  id: string;
  subject: string;
  status: string;
  user: { id: string; name: string; email: string };
  order: { id: string; orderNumber: string; status: string } | null;
  messages: { id: string; body: string; isStaff: boolean; createdAt: string; author: { name: string } }[];
}

/** Message thread + reply box, shared by the customer and staff views. */
export function TicketThread({ ticket, replyPath, onChange }: { ticket: TicketDetail; replyPath: string; onChange: () => Promise<void> }) {
  const [message, setMessage] = useState('');
  const reply = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await reply.run(() => api(replyPath, { method: 'POST', body: { message } }));
    if (ok) {
      setMessage('');
      await onChange();
    }
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {ticket.messages.map((m) => (
          <li key={m.id} className={`flex ${m.isStaff ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[85%] rounded-[10px] px-4 py-3 ${m.isStaff ? 'border border-ink/10 bg-surface' : 'bg-ink text-paper'}`}>
              <p className="mb-1 text-xs opacity-60">
                {m.isStaff ? `${m.author.name} (Support)` : m.author.name} · {dateTime(m.createdAt)}
              </p>
              <p className="whitespace-pre-wrap text-sm">{m.body}</p>
            </div>
          </li>
        ))}
      </ul>
      {ticket.status !== 'CLOSED' && (
        <form onSubmit={submit} className="space-y-3">
          <textarea className="input min-h-24" required maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a reply…" />
          <ErrorBox message={reply.error} />
          <button className="btn-primary" disabled={reply.pending || !message.trim()}>
            {reply.pending && <Spinner />} Send reply
          </button>
        </form>
      )}
    </div>
  );
}
