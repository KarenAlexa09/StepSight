export type Pose = "wave" | "reading" | "point" | "think" | "thumbs" | "oops" | "celebrate" | "hardhat";
export type Move = "bob" | "hop" | "wiggle" | "pop" | "none";

const DEFAULT_MOVE: Record<Pose, Move> = {
  wave: "wiggle",
  reading: "bob",
  point: "pop",
  think: "wiggle",
  thumbs: "pop",
  oops: "wiggle",
  celebrate: "hop",
  hardhat: "bob",
};

export default function Timber({
  pose = "wave",
  move,
  size = 120,
  className = "",
}: {
  pose?: Pose;
  move?: Move;
  size?: number;
  className?: string;
}) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/mascot/${pose}.webp`} alt="" width={size} height={size} className={`timber m-${move ?? DEFAULT_MOVE[pose]} ${className}`} />;
}
