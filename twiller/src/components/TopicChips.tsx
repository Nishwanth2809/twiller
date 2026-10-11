import Link from "next/link";
import type { Topic } from "@/lib/topics";
export default function TopicChips({ topics = [] }: { topics?: Topic[] }) {
  return topics.length ? <div className="twiller-topic-chips mb-2 flex flex-wrap gap-1.5" aria-label="Post topics">
    {topics.map(topic => <Link key={topic._id} href={`/topic/${encodeURIComponent(topic.slug)}`} className="twiller-topic-chip" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>{topic.name}</Link>)}
  </div> : null;
}
