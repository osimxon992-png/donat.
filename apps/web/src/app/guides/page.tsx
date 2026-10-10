import { IdGuide } from '@/components/id-guide';

export const metadata = {
  title: 'Where is my ID?',
  description: 'Where every game and app keeps your player ID, UID, tag or username — and how to tell which operator a phone number belongs to.',
};

export default function GuidesPage() {
  return (
    <div className="space-y-12">
      <div className="max-w-2xl">
        <p className="eyebrow mb-2">ID guide</p>
        <h1 className="text-6xl tracking-wider uppercase sm:text-7xl">Where is my ID?</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          Every game and app hides it somewhere different. Find yours below, check it against the format, and you’ll never send a top-up to the
          wrong account.
        </p>
      </div>
      <IdGuide />
    </div>
  );
}
