/**
 * Logo Pilem Studio: huruf P dengan batang berupa potongan pita film (lubang sprocket)
 * dan tombol play di mangkuknya. Sumber yang sama dengan public/icon.svg & docs/brand.
 */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#f0a63a" />
      <rect x="15" y="12" width="12" height="40" rx="3" fill="#1d1406" />
      <rect x="19" y="16" width="4" height="5" rx="1" fill="#f0a63a" />
      <rect x="19" y="29.5" width="4" height="5" rx="1" fill="#f0a63a" />
      <rect x="19" y="43" width="4" height="5" rx="1" fill="#f0a63a" />
      <path d="M27 12H36a13 13 0 0 1 0 26H27v-8h9a5 5 0 0 0 0-10H27z" fill="#1d1406" />
      <path d="M33 21.5 39.5 25 33 28.5z" fill="#1d1406" />
    </svg>
  );
}
