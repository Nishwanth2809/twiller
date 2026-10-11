import type { Topic } from "./topics";

export interface Circle {
  _id: string;
  slug: string;
  name: string;
  description: string;
  owner: { _id: string; username: string; displayName?: string } | null;
  visibility: "public";
  status: "active" | "disabled";
  relatedTopics: Topic[];
  membershipRole: "owner" | "member" | null;
  memberCount: number;
}
export interface CirclePageData { circles: Circle[]; hasMore: boolean; nextCursor: string | null }
export interface CirclePost { _id: string; circle?: Circle | null; [key: string]: unknown }
