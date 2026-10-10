import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Donat — games, apps & mobile top-ups',
    short_name: 'Donat',
    description: 'Game currency, Telegram Premium and Stars, Steam and PSN wallets, and Uzbek mobile balance.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f3f0e8',
    theme_color: '#161513',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/apple-icon', type: 'image/png', sizes: '180x180' },
    ],
  };
}
