export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <rect x="1" y="7" width="28" height="21" rx="4" fill="#21252d" stroke="#f0a63a" strokeWidth="1.5" />
      <path d="M2 8 L28 3" stroke="#f0a63a" strokeWidth="3" />
      <path d="M7 6.5 L10 2.5 M14 5 L17 1.5 M21 3.8 L24 0.5" stroke="#111318" strokeWidth="1.5" />
      <circle cx="15" cy="17.5" r="4.5" fill="none" stroke="#ebe8e2" strokeWidth="1.5" />
      <circle cx="15" cy="17.5" r="1.5" fill="#f0a63a" />
    </svg>
  );
}
