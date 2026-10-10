import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Home-screen icon: the same mark as icon.svg, on a full-bleed square (iOS rounds the corners). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#161513' }}>
        <svg width="132" height="132" viewBox="4 4 24 24">
          <circle cx="13.2" cy="18.6" r="5.4" fill="none" stroke="#f3f0e8" strokeWidth="3.4" />
          <path d="M18.6 6.5v17.8" stroke="#f3f0e8" strokeWidth="3.4" strokeLinecap="square" />
          <rect x="22.6" y="20.6" width="4.4" height="4.4" fill="#ff4f12" />
        </svg>
      </div>
    ),
    size,
  );
}
