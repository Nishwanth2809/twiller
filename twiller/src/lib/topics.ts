export interface Topic {
  _id: string; slug: string; name: string; description: string;
  status: "active" | "disabled"; following?: boolean;
}
export interface TopicPageData { topics: Topic[]; hasMore: boolean; nextCursor: string | null }
export const MAX_POST_TOPICS = 3;
export function selectTopic(selected: Topic[], topic: Topic): Topic[] {
  if (topic.status !== "active" || selected.some(item => item._id === topic._id) || selected.length >= MAX_POST_TOPICS) return selected;
  return [...selected, topic];
}
