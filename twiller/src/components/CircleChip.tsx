import Link from "next/link";
import type { Circle } from "@/lib/circles";
export default function CircleChip({ circle }: { circle?: Circle | null }) {
  if (!circle || circle.status !== "active") return null;
  return <Link href={`/circle/${encodeURIComponent(circle.slug)}`} className="twiller-circle-chip" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()} aria-label={`Circle ${circle.name}`}>◌ {circle.name}</Link>;
}
