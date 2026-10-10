const ITEMS: [string, string][] = [
  [
    'Where do I find my player ID?',
    'It’s on your in-game profile, usually right under your nickname. Each product page tells you exactly where to look, and the ID guide lists them all in one place. Some games (Mobile Legends, Genshin Impact) also need a server or zone.',
  ],
  [
    'Can I top up someone else?',
    'Yes. Telegram Premium and Stars go to any username, and phone balance goes to any Uzbek number — handy for parents, friends or a gift. Just double-check the username or number before paying.',
  ],
  [
    'Which phone numbers can I top up?',
    'Beeline, Ucell, Mobiuz and Uzmobile numbers in Uzbekistan. Enter all 12 digits starting with 998. Not sure which operator a number is on? The ID guide has a checker.',
  ],
  [
    'How long does delivery take?',
    'Most orders land within a minute of payment. Your order page shows each step as it happens. If a supplier is slow we keep checking for you — you don’t need to place the order again.',
  ],
  [
    'What if I typed the wrong ID?',
    'We check the ID with the supplier before you pay and show you the account’s nickname. If it doesn’t look right, stop there — you haven’t been charged.',
  ],
  [
    'What happens if a top-up fails?',
    'The order is handed to a person on our team. If it can’t be delivered, you’re refunded to the original payment method. You can also open a support ticket from the order page.',
  ],
  [
    'Can I be charged twice?',
    'No. Every checkout carries a one-time key, so pressing “pay” twice or refreshing the page can’t create a second order, and a delivery is never retried until we’ve confirmed the first one didn’t go through.',
  ],
  [
    'Is this store affiliated with the game publishers or operators?',
    'No. Game, app and operator names are used to describe what you’re buying and belong to their owners.',
  ],
];

export function Faq({ limit }: { limit?: number }) {
  return (
    <div className="space-y-2">
      {ITEMS.slice(0, limit).map(([q, a]) => (
        <details key={q} className="group rounded-[10px] border-[3px] border-ink bg-white px-5 py-4 shadow-comic-sm open:bg-pop/25">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-base font-bold [&::-webkit-details-marker]:hidden">
            {q}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="shrink-0 text-ink transition-transform group-open:rotate-180" aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed font-medium text-muted">{a}</p>
        </details>
      ))}
    </div>
  );
}
