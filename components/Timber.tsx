export default function Timber({ size = 120, className = "" }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/mascot/timber.webp" alt="" width={size} height={size} className={`timber ${className}`} />;
}
