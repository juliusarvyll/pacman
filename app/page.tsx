'use client';

import dynamic from 'next/dynamic';

const PhaserGame = dynamic(() => import('@/components/PhaserGame'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center min-h-screen bg-gray-900"><div className="text-white">Loading game...</div></div>
});

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-900">
      <PhaserGame />
    </div>
  );
}
