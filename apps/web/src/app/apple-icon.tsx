import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Home-screen icon: the same mark as icon.svg, on a full-bleed square (iOS rounds the corners). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffd21f' }}>
        <svg width="132" height="132" viewBox="4 4 24 24">
          <path d="M17.8 5.5 9 18h6l-1.8 8.5L23 13.8h-6.4l1.2-8.3Z" fill="#e8262b" stroke="#141414" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
