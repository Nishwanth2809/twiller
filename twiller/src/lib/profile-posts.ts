export interface CanonicalProfilePost {
  _id: string;
  author: string | { _id: string };
  parentId?: string | null;
}

export function appendUniquePage<T extends { _id: string }>(current: T[], next: T[]): T[] {
  const seen = new Set(current.map(item => item._id));
  const merged = [...current];
  for (const item of next) {
    if (seen.has(item._id)) continue;
    seen.add(item._id);
    merged.push(item);
  }
  return merged;
}

export function isOwnRootPost(post: CanonicalProfilePost, userId: string): boolean {
  const authorId = typeof post.author === "string" ? post.author : post.author?._id;
  return Boolean(post._id) && authorId === userId && post.parentId == null;
}

export function prependOwnProfilePost<T extends CanonicalProfilePost>(
  posts: T[],
  post: T,
  userId: string,
): T[] {
  if (!isOwnRootPost(post, userId)) return posts;
  return [post, ...posts.filter(existing => existing._id !== post._id)];
}
