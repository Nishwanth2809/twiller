/**
 * Twiller — Full Demo Content Seeder
 *
 * Populates realistic demo users, avatars, public posts, image posts,
 * replies, Echoes, Topics, Topic follows, Circles, and Circle memberships.
 *
 * Safety requirements:
 * - Requires explicit confirmation (TWILLER_DEMO_SEED_CONFIRM=true or --confirm)
 * - Requires production confirmation if targeting production (TWILLER_PRODUCTION_SEED_CONFIRM=true or --confirm-production)
 * - Supports dry run (TWILLER_DEMO_SEED_DRY_RUN=true or --dry-run)
 * - Strictly additive & idempotent (uses deterministic stable IDs and seedTag)
 * - Never deletes or overwrites real users, posts, or media
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";

import User from "../models/user.js";
import Tweet from "../models/tweet.js";
import Topic from "../models/topic.js";
import TopicFollow from "../models/topicFollow.js";
import Circle from "../models/circle.js";
import CircleMembership from "../models/circleMembership.js";
import Media from "../models/media.js";
import {
  MEDIA_BUCKET,
  useDatabaseMedia,
  mediaDirectory,
  mediaUrl,
} from "../media.js";
import { generateAllAssets } from "./generate-demo-assets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "seed-assets");

export const DEMO_SEED_TAG = "TWILLER_DEMO_V1";

export function stableId(key) {
  return new mongoose.Types.ObjectId(
    createHash("sha256").update(`${DEMO_SEED_TAG}:${key}`).digest("hex").slice(0, 24)
  );
}

// ─── 1. DEMO FIXTURE DEFINITIONS ─────────────────────────────────────────────

export const DEMO_USERS = [
  {
    key: "mayacodes",
    username: "mayacodes",
    displayName: "Maya Chen",
    bio: "AI / ML engineer building practical agents & retrieval systems. PyTorch, LangChain, coffee.",
    location: "San Francisco, CA",
    website: "https://github.com/mayacodes",
    avatarFile: "avatar_maya.jpg",
    joinedDaysAgo: 110,
    topics: ["ai-ml", "data-science"],
  },
  {
    key: "arjunbuilds",
    username: "arjunbuilds",
    displayName: "Arjun Rao",
    bio: "Full-stack developer & systems tinkerer. TypeScript, Node.js, distributed systems.",
    location: "Bengaluru, India",
    website: "https://arjunbuilds.dev",
    avatarFile: "avatar_arjun.jpg",
    joinedDaysAgo: 95,
    topics: ["web-dev", "cloud-devops"],
  },
  {
    key: "sofiaframes",
    username: "sofiaframes",
    displayName: "Sofia Martinez",
    bio: "Visual storyteller & travel photographer. Chasing golden hour across 30+ countries. 📷 Leica M11.",
    location: "Barcelona / Nomad",
    website: "https://sofiaframes.photo",
    avatarFile: "avatar_sofia.jpg",
    joinedDaysAgo: 90,
    topics: ["photography"],
  },
  {
    key: "liamfounder",
    username: "liamfounder",
    displayName: "Liam Carter",
    bio: "Founder @ LaunchKit. Building B2B software that helps indie builders ship faster.",
    location: "Austin, TX",
    website: "https://launchkit.io",
    avatarFile: "avatar_liam.jpg",
    joinedDaysAgo: 85,
    topics: ["startups", "productivity"],
  },
  {
    key: "priyanair",
    username: "priyanair",
    displayName: "Priya Nair",
    bio: "Product & UI/UX designer. Obsessed with micro-interactions, accessibility & typography.",
    location: "London, UK",
    website: "https://priyanair.design",
    avatarFile: "avatar_priya.jpg",
    joinedDaysAgo: 80,
    topics: ["design", "startups"],
  },
  {
    key: "noahdev",
    username: "noahdev",
    displayName: "Noah Williams",
    bio: "Platform & DevOps engineer. Kubernetes, Terraform, zero-downtime deploys. Observability advocate.",
    location: "Seattle, WA",
    website: "https://noahwilliams.io",
    avatarFile: "avatar_noah.jpg",
    joinedDaysAgo: 75,
    topics: ["cloud-devops", "web-dev"],
  },
  {
    key: "aishalabs",
    username: "aishalabs",
    displayName: "Aisha Khan",
    bio: "Data scientist & quantitative researcher. Exploring graph neural nets, predictive modeling & causality.",
    location: "Toronto, Canada",
    website: "https://aishalabs.ai",
    avatarFile: "avatar_aisha.jpg",
    joinedDaysAgo: 70,
    topics: ["data-science", "ai-ml"],
  },
  {
    key: "ethanwrites",
    username: "ethanwrites",
    displayName: "Ethan Brooks",
    bio: "CS student & technical writer. Exploring habit loops, productivity workflows & deep work.",
    location: "Boston, MA",
    website: "https://ethanbrooks.blog",
    avatarFile: "avatar_ethan.jpg",
    joinedDaysAgo: 60,
    topics: ["productivity", "web-dev"],
  },
];

export const DEMO_TOPICS = [
  {
    slug: "ai-ml",
    name: "AI & Machine Learning",
    description: "Artificial intelligence, machine learning, agents, and neural networks.",
  },
  {
    slug: "web-dev",
    name: "Web Development",
    description: "Frontend, backend, APIs, distributed systems, and modern web architectures.",
  },
  {
    slug: "design",
    name: "Design",
    description: "Product design, UI/UX, typography, design systems, and user research.",
  },
  {
    slug: "startups",
    name: "Startups",
    description: "Indie hacking, bootstrapping, product-market fit, and early distribution.",
  },
  {
    slug: "photography",
    name: "Photography",
    description: "Visual arts, camera gear, light composition, street, and travel photography.",
  },
  {
    slug: "cloud-devops",
    name: "Cloud & DevOps",
    description: "Infrastructure, containers, CI/CD, observability, and platform engineering.",
  },
  {
    slug: "data-science",
    name: "Data Science",
    description: "Statistics, data pipelines, predictive models, graph analysis, and analytics.",
  },
  {
    slug: "productivity",
    name: "Productivity",
    description: "Focus habits, time management, knowledge synthesis, and workflow tools.",
  },
];

export const DEMO_CIRCLES = [
  {
    slug: "ai-builders",
    name: "AI Builders",
    description: "Engineers and researchers building autonomous agents, RAG, and generative models.",
    ownerKey: "mayacodes",
    memberKeys: ["aishalabs", "arjunbuilds", "noahdev"],
    relatedTopicSlugs: ["ai-ml", "data-science"],
  },
  {
    slug: "frontend-guild",
    name: "Frontend Guild",
    description: "Everything client-side: React, Next.js, CSS architecture, performance, and accessibility.",
    ownerKey: "arjunbuilds",
    memberKeys: ["priyanair", "noahdev", "ethanwrites"],
    relatedTopicSlugs: ["web-dev", "design"],
  },
  {
    slug: "design-collective",
    name: "Design Collective",
    description: "UI/UX critiques, design systems, typography choices, and user experience discussions.",
    ownerKey: "priyanair",
    memberKeys: ["sofiaframes", "ethanwrites", "arjunbuilds"],
    relatedTopicSlugs: ["design", "photography"],
  },
  {
    slug: "indie-founders",
    name: "Indie Founders",
    description: "Building profitable software businesses, early traction, distribution, and pricing.",
    ownerKey: "liamfounder",
    memberKeys: ["arjunbuilds", "priyanair", "mayacodes"],
    relatedTopicSlugs: ["startups", "productivity"],
  },
];

// Following relationships (symmetric graph updates)
export const DEMO_FOLLOWS = [
  ["mayacodes", "arjunbuilds"],
  ["mayacodes", "aishalabs"],
  ["mayacodes", "liamfounder"],
  ["arjunbuilds", "mayacodes"],
  ["arjunbuilds", "noahdev"],
  ["arjunbuilds", "priyanair"],
  ["arjunbuilds", "liamfounder"],
  ["sofiaframes", "priyanair"],
  ["sofiaframes", "ethanwrites"],
  ["sofiaframes", "mayacodes"],
  ["liamfounder", "arjunbuilds"],
  ["liamfounder", "priyanair"],
  ["liamfounder", "noahdev"],
  ["liamfounder", "mayacodes"],
  ["priyanair", "sofiaframes"],
  ["priyanair", "arjunbuilds"],
  ["priyanair", "liamfounder"],
  ["priyanair", "ethanwrites"],
  ["noahdev", "arjunbuilds"],
  ["noahdev", "aishalabs"],
  ["noahdev", "mayacodes"],
  ["aishalabs", "mayacodes"],
  ["aishalabs", "noahdev"],
  ["aishalabs", "arjunbuilds"],
  ["ethanwrites", "liamfounder"],
  ["ethanwrites", "priyanair"],
  ["ethanwrites", "arjunbuilds"],
  ["ethanwrites", "mayacodes"],
];

// 28 Root Posts
export const DEMO_POSTS = [
  {
    key: "post_1",
    authorKey: "mayacodes",
    content: "Spent the evening comparing retrieval strategies for a small RAG project. The biggest improvement wasn't the model — it was cleaning and deduplicating the raw chunks before embedding.",
    topicSlugs: ["ai-ml"],
    circleSlug: "ai-builders",
    imageFile: null,
    daysAgo: 18,
    hoursAgo: 4,
    likerKeys: ["arjunbuilds", "aishalabs", "noahdev", "liamfounder", "priyanair", "ethanwrites", "sofiaframes"],
    retweeterKeys: ["arjunbuilds", "aishalabs", "liamfounder"],
    bookmarkKeys: ["arjunbuilds", "liamfounder"],
  },
  {
    key: "post_2",
    authorKey: "arjunbuilds",
    content: "Small reminder: if your API route needs six nested conditionals, the problem might be the route design, not the framework. Split endpoints by caller intent.",
    topicSlugs: ["web-dev"],
    circleSlug: "frontend-guild",
    imageFile: "post_code_editor.jpg",
    daysAgo: 17,
    hoursAgo: 6,
    likerKeys: ["noahdev", "mayacodes", "priyanair", "liamfounder", "aishalabs", "ethanwrites"],
    retweeterKeys: ["noahdev", "priyanair", "mayacodes", "ethanwrites"],
    bookmarkKeys: ["noahdev", "priyanair"],
  },
  {
    key: "post_3",
    authorKey: "sofiaframes",
    content: "Caught this light five minutes before sunset in the Gothic Quarter. Worth carrying the 35mm prime all day through cobblestone streets.",
    topicSlugs: ["photography"],
    circleSlug: "design-collective",
    imageFile: "post_city_skyline.jpg",
    daysAgo: 16,
    hoursAgo: 2,
    likerKeys: ["priyanair", "ethanwrites", "mayacodes", "arjunbuilds", "liamfounder"],
    retweeterKeys: ["priyanair", "ethanwrites"],
    bookmarkKeys: ["priyanair"],
  },
  {
    key: "post_4",
    authorKey: "liamfounder",
    content: "Building an early-stage startup teaches you that distribution is a product feature. If no one discovers what you deployed, code elegance doesn't keep the lights on.",
    topicSlugs: ["startups"],
    circleSlug: "indie-founders",
    imageFile: null,
    daysAgo: 15,
    hoursAgo: 8,
    likerKeys: ["arjunbuilds", "priyanair", "mayacodes", "noahdev", "ethanwrites"],
    retweeterKeys: ["priyanair", "ethanwrites"],
    bookmarkKeys: ["ethanwrites"],
  },
  {
    key: "post_5",
    authorKey: "priyanair",
    content: "Good UI isn't about adding more elements. Half the job is knowing what to remove. When you prioritize negative space, users discover what actually matters.",
    topicSlugs: ["design"],
    circleSlug: "design-collective",
    imageFile: "post_ui_mockup.jpg",
    daysAgo: 14,
    hoursAgo: 3,
    likerKeys: ["sofiaframes", "arjunbuilds", "liamfounder", "ethanwrites", "mayacodes"],
    retweeterKeys: ["liamfounder", "sofiaframes", "arjunbuilds"],
    bookmarkKeys: ["arjunbuilds", "liamfounder"],
  },
  {
    key: "post_6",
    authorKey: "noahdev",
    content: "Today's deployment lesson: readiness checks are not optional once real users depend on the service. Cold-start traffic hitting an unready container will ruin your metrics.",
    topicSlugs: ["cloud-devops"],
    circleSlug: null,
    imageFile: "post_cloud_server.jpg",
    daysAgo: 14,
    hoursAgo: 11,
    likerKeys: ["arjunbuilds", "aishalabs", "liamfounder", "mayacodes"],
    retweeterKeys: ["arjunbuilds", "aishalabs"],
    bookmarkKeys: ["arjunbuilds"],
  },
  {
    key: "post_7",
    authorKey: "aishalabs",
    content: "Feature engineering still wins more production projects than people admit. A clean domain heuristic often outperforms an extra billion parameters.",
    topicSlugs: ["data-science", "ai-ml"],
    circleSlug: "ai-builders",
    imageFile: "post_ai_neural.jpg",
    daysAgo: 13,
    hoursAgo: 5,
    likerKeys: ["mayacodes", "arjunbuilds", "noahdev", "ethanwrites"],
    retweeterKeys: ["mayacodes"],
    bookmarkKeys: ["mayacodes"],
  },
  {
    key: "post_8",
    authorKey: "ethanwrites",
    content: "Trying a simple rule this week: finish one high-priority deep work session before opening email or social feeds. Cognitive energy is finite.",
    topicSlugs: ["productivity"],
    circleSlug: null,
    imageFile: "post_coffee_workspace.jpg",
    daysAgo: 12,
    hoursAgo: 7,
    likerKeys: ["liamfounder", "priyanair", "sofiaframes"],
    retweeterKeys: ["liamfounder"],
    bookmarkKeys: [],
  },
  {
    key: "post_9",
    authorKey: "mayacodes",
    content: "Evaluating smaller 7B parameter models for specialized query classification. With quantization, inference latency drops below 25ms on consumer hardware.",
    topicSlugs: ["ai-ml"],
    circleSlug: "ai-builders",
    imageFile: null,
    daysAgo: 12,
    hoursAgo: 14,
    likerKeys: ["aishalabs", "arjunbuilds", "noahdev"],
    retweeterKeys: [],
    bookmarkKeys: [],
  },
  {
    key: "post_10",
    authorKey: "arjunbuilds",
    content: "Optimistic UI mutations paired with idempotent server endpoints feel like magic. The perceived speed improvement beats weeks of backend optimization.",
    topicSlugs: ["web-dev"],
    circleSlug: "frontend-guild",
    imageFile: "post_desk_setup.jpg",
    daysAgo: 11,
    hoursAgo: 9,
    likerKeys: ["priyanair", "noahdev", "ethanwrites", "mayacodes", "liamfounder"],
    retweeterKeys: ["priyanair", "noahdev"],
    bookmarkKeys: ["priyanair"],
  },
  {
    key: "post_11",
    authorKey: "sofiaframes",
    content: "Morning mist rising over the alpine pass at 2,400m. The contrast between pine valleys and stone ridges was breathtaking.",
    topicSlugs: ["photography"],
    circleSlug: null,
    imageFile: "post_mountain_travel.jpg",
    daysAgo: 10,
    hoursAgo: 4,
    likerKeys: ["ethanwrites", "priyanair", "liamfounder", "sofiaframes"],
    retweeterKeys: ["ethanwrites"],
    bookmarkKeys: [],
  },
  {
    key: "post_12",
    authorKey: "liamfounder",
    content: "The hardest metric to abandon when you're early: page views. The only metric that keeps you honest: recurring customer retention.",
    topicSlugs: ["startups", "productivity"],
    circleSlug: "indie-founders",
    imageFile: null,
    daysAgo: 10,
    hoursAgo: 12,
    likerKeys: ["arjunbuilds", "priyanair", "mayacodes"],
    retweeterKeys: ["arjunbuilds"],
    bookmarkKeys: [],
  },
  {
    key: "post_13",
    authorKey: "priyanair",
    content: "Design tokens bridge the gap between Figma and code. When colors, spacing, and typography share the same semantic names, handoffs become painless.",
    topicSlugs: ["design", "web-dev"],
    circleSlug: "design-collective",
    imageFile: null,
    daysAgo: 9,
    hoursAgo: 6,
    likerKeys: ["arjunbuilds", "sofiaframes", "ethanwrites"],
    retweeterKeys: ["arjunbuilds"],
    bookmarkKeys: ["arjunbuilds"],
  },
  {
    key: "post_14",
    authorKey: "noahdev",
    content: "Zero-downtime database migrations: expand first, migrate background writes, backfill historical data, contract legacy columns. Never skip the phases.",
    topicSlugs: ["cloud-devops"],
    circleSlug: null,
    imageFile: "post_architecture_diagram.jpg",
    daysAgo: 9,
    hoursAgo: 15,
    likerKeys: ["arjunbuilds", "aishalabs", "mayacodes", "ethanwrites"],
    retweeterKeys: ["arjunbuilds"],
    bookmarkKeys: ["aishalabs"],
  },
  {
    key: "post_15",
    authorKey: "aishalabs",
    content: "Causal inference in marketing attribution is wild. Correlation tricks teams into investing in channels that merely capture demand that already existed.",
    topicSlugs: ["data-science"],
    circleSlug: null,
    imageFile: null,
    daysAgo: 8,
    hoursAgo: 3,
    likerKeys: ["mayacodes", "liamfounder"],
    retweeterKeys: [],
    bookmarkKeys: [],
  },
  {
    key: "post_16",
    authorKey: "ethanwrites",
    content: "Time-blocking 4-hour morning focus blocks. The key isn't working more hours—it's having zero context switching during your peak focus window.",
    topicSlugs: ["productivity"],
    circleSlug: null,
    imageFile: "post_productivity_planner.jpg",
    daysAgo: 8,
    hoursAgo: 10,
    likerKeys: ["liamfounder", "priyanair", "sofiaframes", "mayacodes"],
    retweeterKeys: ["liamfounder"],
    bookmarkKeys: ["liamfounder"],
  },
  {
    key: "post_17",
    authorKey: "mayacodes",
    content: "Vector search without metadata pre-filtering is like searching an encyclopedia by page color. Hybrid lexical + dense retrieval is the sweet spot.",
    topicSlugs: ["ai-ml", "data-science"],
    circleSlug: "ai-builders",
    imageFile: null,
    daysAgo: 7,
    hoursAgo: 5,
    likerKeys: ["aishalabs", "arjunbuilds", "noahdev"],
    retweeterKeys: ["aishalabs"],
    bookmarkKeys: [],
  },
  {
    key: "post_18",
    authorKey: "arjunbuilds",
    content: "Decoupling read and write paths with event streams simplified our synchronization pipeline. Ingestion throughput tripled immediately.",
    topicSlugs: ["web-dev", "cloud-devops"],
    circleSlug: "frontend-guild",
    imageFile: null,
    daysAgo: 7,
    hoursAgo: 13,
    likerKeys: ["noahdev", "aishalabs", "liamfounder"],
    retweeterKeys: [],
    bookmarkKeys: [],
  },
  {
    key: "post_19",
    authorKey: "sofiaframes",
    content: "Rainy evening streets transform asphalt into dark mirrors. Neon light reflections give everyday city corners a cinematic atmosphere.",
    topicSlugs: ["photography"],
    circleSlug: "design-collective",
    imageFile: "post_street_photo.jpg",
    daysAgo: 6,
    hoursAgo: 8,
    likerKeys: ["priyanair", "ethanwrites", "mayacodes", "sofiaframes"],
    retweeterKeys: ["priyanair"],
    bookmarkKeys: ["ethanwrites"],
  },
  {
    key: "post_20",
    authorKey: "liamfounder",
    content: "Customer interviews are uncomfortable when you do them right. If everyone loves your idea, you're asking leading questions, not finding real pain.",
    topicSlugs: ["startups"],
    circleSlug: "indie-founders",
    imageFile: null,
    daysAgo: 6,
    hoursAgo: 16,
    likerKeys: ["priyanair", "arjunbuilds", "ethanwrites"],
    retweeterKeys: [],
    bookmarkKeys: [],
  },
  {
    key: "post_21",
    authorKey: "priyanair",
    content: "Accessibility is an engineering and design constraint from day one, not a QA audit checklist item right before launch.",
    topicSlugs: ["design", "web-dev"],
    circleSlug: "frontend-guild",
    imageFile: null,
    daysAgo: 5,
    hoursAgo: 4,
    likerKeys: ["arjunbuilds", "noahdev", "ethanwrites", "mayacodes"],
    retweeterKeys: ["ethanwrites"],
    bookmarkKeys: ["noahdev"],
  },
  {
    key: "post_22",
    authorKey: "noahdev",
    content: "Automated canary deployments saved us from a subtle memory leak this morning. 5% traffic alerted on heap growth before 95% saw a single dropped socket.",
    topicSlugs: ["cloud-devops"],
    circleSlug: null,
    imageFile: null,
    daysAgo: 5,
    hoursAgo: 12,
    likerKeys: ["arjunbuilds", "mayacodes", "aishalabs"],
    retweeterKeys: ["mayacodes"],
    bookmarkKeys: [],
  },
  {
    key: "post_23",
    authorKey: "aishalabs",
    content: "Plotting loss curves on log scales exposes training instabilities that linear scales completely hide. Always check your tails.",
    topicSlugs: ["data-science"],
    circleSlug: "ai-builders",
    imageFile: null,
    daysAgo: 4,
    hoursAgo: 6,
    likerKeys: ["mayacodes", "noahdev"],
    retweeterKeys: [],
    bookmarkKeys: [],
  },
  {
    key: "post_24",
    authorKey: "ethanwrites",
    content: "Writing technical documentation forced me to understand our codebase deeper than writing the actual features did.",
    topicSlugs: ["productivity", "web-dev"],
    circleSlug: null,
    imageFile: null,
    daysAgo: 4,
    hoursAgo: 14,
    likerKeys: ["liamfounder", "arjunbuilds", "priyanair"],
    retweeterKeys: [],
    bookmarkKeys: [],
  },
  {
    key: "post_25",
    authorKey: "priyanair",
    content: "Echoing @arjunbuilds on nested conditionals: This applies to dashboard state machines especially. If your UI has 8 boolean flags, you need a finite state machine, not more if statements.",
    topicSlugs: ["design", "web-dev"],
    circleSlug: "frontend-guild",
    imageFile: null,
    daysAgo: 3,
    hoursAgo: 8,
    likerKeys: ["arjunbuilds", "noahdev", "ethanwrites"],
    retweeterKeys: ["arjunbuilds"],
    bookmarkKeys: ["arjunbuilds"],
  },
  {
    key: "post_26",
    authorKey: "liamfounder",
    content: "Echoing @mayacodes on data chunking: In product discovery, user feedback has the exact same problem. If you don't clean and categorize the raw feedback chunks, AI summaries give you generic noise.",
    topicSlugs: ["startups", "ai-ml"],
    circleSlug: "indie-founders",
    imageFile: null,
    daysAgo: 3,
    hoursAgo: 15,
    likerKeys: ["mayacodes", "priyanair", "arjunbuilds"],
    retweeterKeys: ["mayacodes"],
    bookmarkKeys: ["mayacodes"],
  },
  {
    key: "post_27",
    authorKey: "ethanwrites",
    content: "Echoing @liamfounder: 'Distribution is a product feature.' The easiest way to distribute your work is to build in public where your future customers already hang out.",
    topicSlugs: ["startups", "productivity"],
    circleSlug: null,
    imageFile: null,
    daysAgo: 2,
    hoursAgo: 7,
    likerKeys: ["liamfounder", "priyanair", "arjunbuilds"],
    retweeterKeys: [],
    bookmarkKeys: [],
  },
  {
    key: "post_28",
    authorKey: "liamfounder",
    content: "What metric did your startup stop caring about once real paying users arrived? For us, it was raw page traffic.",
    topicSlugs: ["startups"],
    circleSlug: "indie-founders",
    imageFile: null,
    daysAgo: 1,
    hoursAgo: 5,
    likerKeys: ["arjunbuilds", "priyanair", "ethanwrites", "mayacodes"],
    retweeterKeys: ["ethanwrites"],
    bookmarkKeys: [],
  },
];

// 14 Thread Replies
export const DEMO_REPLIES = [
  // Thread 1 on post_1 (Maya's RAG post)
  {
    key: "reply_1",
    parentPostKey: "post_1",
    authorKey: "arjunbuilds",
    content: "Chunk quality is underrated. Bad retrieval makes even strong models look bad.",
    daysAgo: 18,
    hoursAgo: 3,
    likerKeys: ["mayacodes", "aishalabs"],
  },
  {
    key: "reply_2",
    parentPostKey: "post_1",
    authorKey: "aishalabs",
    content: "Did you compare semantic chunking against fixed windows on your corpus?",
    daysAgo: 18,
    hoursAgo: 2,
    likerKeys: ["mayacodes"],
  },
  {
    key: "reply_3",
    parentPostKey: "post_1",
    authorKey: "mayacodes",
    content: "Yes — semantic helped on long technical docs, but fixed windows were cheaper for structured FAQs.",
    daysAgo: 17,
    hoursAgo: 22,
    likerKeys: ["aishalabs", "arjunbuilds"],
  },

  // Thread 2 on post_2 (Arjun's API routes post)
  {
    key: "reply_4",
    parentPostKey: "post_2",
    authorKey: "noahdev",
    content: "Usually happens when one endpoint is secretly trying to be three different operations.",
    daysAgo: 17,
    hoursAgo: 5,
    likerKeys: ["arjunbuilds"],
  },
  {
    key: "reply_5",
    parentPostKey: "post_2",
    authorKey: "arjunbuilds",
    content: "Exactly. Split by intent rather than overloading query params with subtle side-effects.",
    daysAgo: 17,
    hoursAgo: 3,
    likerKeys: ["noahdev", "priyanair"],
  },
  {
    key: "reply_6",
    parentPostKey: "post_2",
    authorKey: "priyanair",
    content: "And the frontend ends up having to write custom parsers for every edge case.",
    daysAgo: 16,
    hoursAgo: 20,
    likerKeys: ["arjunbuilds"],
  },

  // Thread 3 on post_3 (Sofia's Gothic Quarter photo)
  {
    key: "reply_7",
    parentPostKey: "post_3",
    authorKey: "ethanwrites",
    content: "The framing on the archway is incredible. What lens was this?",
    daysAgo: 16,
    hoursAgo: 1,
    likerKeys: ["sofiaframes"],
  },
  {
    key: "reply_8",
    parentPostKey: "post_3",
    authorKey: "sofiaframes",
    content: "Thanks Ethan! 35mm f/1.4, shot wide open at 1/250s.",
    daysAgo: 15,
    hoursAgo: 22,
    likerKeys: ["ethanwrites"],
  },

  // Thread 4 on post_5 (Priya's UI design post)
  {
    key: "reply_9",
    parentPostKey: "post_5",
    authorKey: "liamfounder",
    content: "Took us 6 months to realize our most-requested dashboard feature was just removing 4 unused widgets.",
    daysAgo: 14,
    hoursAgo: 2,
    likerKeys: ["priyanair"],
  },
  {
    key: "reply_10",
    parentPostKey: "post_5",
    authorKey: "priyanair",
    content: "Negative space is an active design decision, not empty space.",
    daysAgo: 13,
    hoursAgo: 23,
    likerKeys: ["liamfounder", "ethanwrites"],
  },
  {
    key: "reply_11",
    parentPostKey: "post_5",
    authorKey: "ethanwrites",
    content: "Applies to documentation too. Cognitive density causes user fatigue.",
    daysAgo: 13,
    hoursAgo: 18,
    likerKeys: ["priyanair"],
  },

  // Thread 5 on post_6 (Noah's readiness checks post)
  {
    key: "reply_12",
    parentPostKey: "post_6",
    authorKey: "arjunbuilds",
    content: "Amen. Cold-start traffic hitting an unready container will ruin your weekend.",
    daysAgo: 14,
    hoursAgo: 9,
    likerKeys: ["noahdev"],
  },
  {
    key: "reply_13",
    parentPostKey: "post_6",
    authorKey: "aishalabs",
    content: "Also helps when worker background queues are initializing dependencies before taking HTTP requests.",
    daysAgo: 14,
    hoursAgo: 6,
    likerKeys: ["noahdev", "arjunbuilds"],
  },

  // Thread 6 on post_28 (Liam's startup metric question)
  {
    key: "reply_14",
    parentPostKey: "post_28",
    authorKey: "arjunbuilds",
    content: "Social share count. Paying teams care about uptime and webhook reliability, not how viral a blog post was.",
    daysAgo: 1,
    hoursAgo: 3,
    likerKeys: ["liamfounder"],
  },
];

// ─── 2. SEED ENGINE & SAFETY CHECKS ──────────────────────────────────────────

export async function runDemoSeeder(options = {}) {
  const env = options.env || process.env;
  const args = options.args || process.argv.slice(2);

  const isConfirmed =
    env.TWILLER_DEMO_SEED_CONFIRM === "true" ||
    args.includes("--confirm");

  const isProductionConfirmed =
    env.TWILLER_PRODUCTION_SEED_CONFIRM === "true" ||
    args.includes("--confirm-production");

  const isDryRun =
    env.TWILLER_DEMO_SEED_DRY_RUN === "true" ||
    args.includes("--dry-run");

  const uri = options.uri || env.MONGODB_URI || env.MONOGDB_URL;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is required");
  }

  let dbName = "unknown";
  try {
    const parsed = new URL(uri);
    dbName = parsed.pathname.replace(/^\//, "");
  } catch {}

  const stage = env.TWILLER_DEPLOYMENT_STAGE || (env.NODE_ENV === "production" ? "production" : "development");
  const isProdEnv =
    stage === "production" ||
    (!["twiller_staging", "twiller_phase3_acceptance", "test"].includes(dbName) &&
      !/^mongodb:\/\/(127\.0\.0\.1|localhost)/.test(uri));

  // Safety checks BEFORE database connection
  if (!isDryRun) {
    if (!isConfirmed) {
      throw new Error(
        "Refusing demo seed: explicit confirmation required. Pass --confirm or set TWILLER_DEMO_SEED_CONFIRM=true"
      );
    }
    if (isProdEnv && !isProductionConfirmed) {
      throw new Error(
        "Refusing demo seed against production database: second explicit confirmation required. Pass --confirm-production or set TWILLER_PRODUCTION_SEED_CONFIRM=true"
      );
    }
  }

  const isExternalConnection = !mongoose.connection || mongoose.connection.readyState !== 1;
  if (isExternalConnection && !isDryRun) {
    await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  }

  try {
    const connectedDbName = mongoose.connection?.db?.databaseName || dbName;

    // Query existing demo data if connected
    let existingDemoUsersCount = 0;
    let existingDemoPostsCount = 0;
    if (mongoose.connection?.readyState === 1 && User.collection?.countDocuments) {
      existingDemoUsersCount = await User.collection.countDocuments({
        $or: [
          { seedTag: DEMO_SEED_TAG },
          { username: { $in: DEMO_USERS.map(u => u.username) } },
        ],
      }).catch(() => 0);
      existingDemoPostsCount = await Tweet.collection.countDocuments({
        seedTag: DEMO_SEED_TAG,
      }).catch(() => 0);
    }

    console.log("==================================================");
    console.log("TWILLER DEMO CONTENT SEEDER");
    console.log("==================================================");
    console.log(`Database:              ${connectedDbName}`);
    console.log(`Deployment Stage:      ${stage}`);
    console.log(`Is Production Target:  ${isProdEnv ? "YES (guarded)" : "NO"}`);
    console.log(`Existing Demo Users:   ${existingDemoUsersCount}`);
    console.log(`Existing Demo Posts:   ${existingDemoPostsCount}`);
    console.log(`Dry Run Mode:          ${isDryRun ? "ACTIVE (no writes)" : "INACTIVE"}`);
    console.log("==================================================");

    if (isDryRun) {
      console.log("\n[DRY RUN SUMMARY]");
      console.log(`- Would ensure ${DEMO_USERS.length} demo user profiles exist`);
      console.log(`- Would ensure ${DEMO_TOPICS.length} topics and user follows exist`);
      console.log(`- Would ensure ${DEMO_CIRCLES.length} circles and memberships exist`);
      console.log(`- Would ensure 19 visual assets are ingested into media storage`);
      console.log(`- Would ensure ${DEMO_POSTS.length} public root posts exist (11 with images, 6 circle posts)`);
      console.log(`- Would ensure ${DEMO_REPLIES.length} thread replies exist`);
      console.log("- Dry run completed cleanly with zero writes.");
      return {
        dryRun: true,
        usersCount: DEMO_USERS.length,
        postsCount: DEMO_POSTS.length,
        repliesCount: DEMO_REPLIES.length,
        topicsCount: DEMO_TOPICS.length,
        circlesCount: DEMO_CIRCLES.length,
      };
    }

    // Ensure assets are generated locally
    await generateAllAssets(ASSETS_DIR);

    // ─── STEP 1: SEED TOPICS ─────────────────────────────────────────────────
    console.log("\n[1/7] Seeding Topics...");
    const topicMap = new Map();
    for (const spec of DEMO_TOPICS) {
      const topicId = stableId(`topic:${spec.slug}`);
      const existing = await Topic.findOne({ slug: spec.slug });
      if (existing) {
        topicMap.set(spec.slug, existing._id);
      } else {
        await Topic.collection.updateOne(
          { _id: topicId },
          {
            $setOnInsert: {
              slug: spec.slug,
              name: spec.name,
              description: spec.description,
              status: "active",
              seedTag: DEMO_SEED_TAG,
              createdAt: new Date("2026-01-01T00:00:00Z"),
              updatedAt: new Date("2026-01-01T00:00:00Z"),
            },
          },
          { upsert: true }
        );
        topicMap.set(spec.slug, topicId);
      }
    }
    console.log(`✓ ${topicMap.size} Topics active and mapped.`);

    // ─── STEP 2: SEED USERS & AVATARS ────────────────────────────────────────
    console.log("\n[2/7] Seeding Demo Users & Ingesting Avatars...");
    const userMap = new Map();
    const bucket = options.bucket || (mongoose.connection?.db && typeof mongoose.connection.db.collection === "function"
      ? new GridFSBucket(mongoose.connection.db, { bucketName: MEDIA_BUCKET })
      : null);
    const isDbMedia = useDatabaseMedia(env);

    for (const spec of DEMO_USERS) {
      const userId = stableId(`user:${spec.key}`);
      const mediaId = stableId(`media:${spec.avatarFile}`);
      const avatarPath = path.join(ASSETS_DIR, spec.avatarFile);
      const avatarBuffer = await readFile(avatarPath);

      // Ingest Avatar Media
      if (isDbMedia && bucket) {
        const fileExists = await bucket.find({ _id: mediaId }).limit(1).hasNext();
        if (!fileExists) {
          await pipeline(
            Readable.from([avatarBuffer]),
            bucket.openUploadStreamWithId(mediaId, `${mediaId}.jpg`, { contentType: "image/jpeg" })
          );
        }
      } else {
        const dir = mediaDirectory();
        const dest = path.join(dir, `${mediaId}.jpg`);
        const { mkdir, writeFile: fsWriteFile } = await import("node:fs/promises");
        await mkdir(dir, { recursive: true });
        await fsWriteFile(dest, avatarBuffer);
      }

      await Media.collection.updateOne(
        { _id: mediaId },
        {
          $setOnInsert: {
            owner: userId,
            kind: "image",
            mime: "image/jpeg",
            bytes: avatarBuffer.length,
            filename: `${mediaId}.jpg`,
            published: true,
            seedTag: DEMO_SEED_TAG,
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );

      const avatarEndpointUrl = mediaUrl(mediaId);
      const joinedDate = new Date(Date.now() - spec.joinedDaysAgo * 86400000);

      // Upsert Demo User
      const existingUser = await User.findOne({ username: spec.username });
      if (existingUser && String(existingUser._id) !== String(userId)) {
        throw new Error(`Username collision: @${spec.username} already belongs to an existing user.`);
      }

      await User.collection.updateOne(
        { _id: userId },
        {
          $set: {
            username: spec.username,
            displayName: spec.displayName,
            bio: spec.bio,
            location: spec.location,
            website: spec.website,
            avatar: avatarEndpointUrl,
            role: "user",
            accountStatus: "active",
            plan: "gold",
            planActivatedAt: joinedDate,
            quotaStartsAt: joinedDate,
            joinedDate: joinedDate,
            seedTag: DEMO_SEED_TAG,
          },
          $setOnInsert: {
            email: `${spec.username}@demo.twiller.local`,
            firebaseUid: `demo-uid-${spec.username}`,
            phoneNumber: "",
            followers: [],
            following: [],
            bookmarks: [],
            tweetCount: 0,
            notificationsEnabled: true,
          },
        },
        { upsert: true }
      );
      userMap.set(spec.key, userId);

      // Seed Topic Follows for user
      for (const tSlug of spec.topics) {
        const tId = topicMap.get(tSlug);
        if (tId) {
          await TopicFollow.collection.updateOne(
            { user: userId, topic: tId },
            { $setOnInsert: { user: userId, topic: tId, createdAt: joinedDate, seedTag: DEMO_SEED_TAG } },
            { upsert: true }
          );
        }
      }
    }
    console.log(`✓ ${userMap.size} Demo users and avatars ready.`);

    // ─── STEP 3: SYNC SOCIAL GRAPH (FOLLOWERS / FOLLOWING) ───────────────────
    console.log("\n[3/7] Connecting Social Graph Relations...");
    for (const [fromKey, toKey] of DEMO_FOLLOWS) {
      const fromId = userMap.get(fromKey);
      const toId = userMap.get(toKey);
      if (fromId && toId) {
        await User.collection.updateOne({ _id: fromId }, { $addToSet: { following: toId } });
        await User.collection.updateOne({ _id: toId }, { $addToSet: { followers: fromId } });
      }
    }
    console.log(`✓ Social graph edges synchronized across demo users.`);

    // ─── STEP 4: SEED CIRCLES & MEMBERSHIPS ──────────────────────────────────
    console.log("\n[4/7] Seeding Circles & Memberships...");
    const circleMap = new Map();
    for (const spec of DEMO_CIRCLES) {
      const circleId = stableId(`circle:${spec.slug}`);
      const ownerId = userMap.get(spec.ownerKey);
      const relatedTopics = spec.relatedTopicSlugs.map(s => topicMap.get(s)).filter(Boolean);

      const existingCircle = await Circle.findOne({ slug: spec.slug });
      if (existingCircle && String(existingCircle._id) !== String(circleId)) {
        circleMap.set(spec.slug, existingCircle._id);
        continue;
      }

      await Circle.collection.updateOne(
        { _id: circleId },
        {
          $set: {
            slug: spec.slug,
            name: spec.name,
            description: spec.description,
            owner: ownerId,
            visibility: "public",
            status: "active",
            relatedTopics,
            seedTag: DEMO_SEED_TAG,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date("2026-01-15T00:00:00Z"),
          },
        },
        { upsert: true }
      );
      circleMap.set(spec.slug, circleId);

      // Owner membership
      await CircleMembership.collection.updateOne(
        { circle: circleId, user: ownerId },
        { $setOnInsert: { circle: circleId, user: ownerId, role: "owner", joinedAt: new Date("2026-01-15T00:00:00Z"), seedTag: DEMO_SEED_TAG } },
        { upsert: true }
      );

      // Member memberships
      for (const mKey of spec.memberKeys) {
        const memberId = userMap.get(mKey);
        if (memberId) {
          await CircleMembership.collection.updateOne(
            { circle: circleId, user: memberId },
            { $setOnInsert: { circle: circleId, user: memberId, role: "member", joinedAt: new Date("2026-01-16T00:00:00Z"), seedTag: DEMO_SEED_TAG } },
            { upsert: true }
          );
        }
      }
    }
    console.log(`✓ ${circleMap.size} Circles and memberships ready.`);

    // ─── STEP 5: SEED POST IMAGES ────────────────────────────────────────────
    console.log("\n[5/7] Ingesting Post Images into Storage...");
    const postMediaMap = new Map();
    const postImageFiles = [
      "post_desk_setup.jpg",
      "post_code_editor.jpg",
      "post_city_skyline.jpg",
      "post_mountain_travel.jpg",
      "post_coffee_workspace.jpg",
      "post_ui_mockup.jpg",
      "post_cloud_server.jpg",
      "post_ai_neural.jpg",
      "post_productivity_planner.jpg",
      "post_street_photo.jpg",
      "post_architecture_diagram.jpg",
    ];

    for (const filename of postImageFiles) {
      const mediaId = stableId(`media:${filename}`);
      const filePath = path.join(ASSETS_DIR, filename);
      const imgBuffer = await readFile(filePath);

      if (isDbMedia && bucket) {
        const fileExists = await bucket.find({ _id: mediaId }).limit(1).hasNext();
        if (!fileExists) {
          await pipeline(
            Readable.from([imgBuffer]),
            bucket.openUploadStreamWithId(mediaId, `${mediaId}.jpg`, { contentType: "image/jpeg" })
          );
        }
      } else {
        const dir = mediaDirectory();
        const dest = path.join(dir, `${mediaId}.jpg`);
        const { mkdir, writeFile: fsWriteFile } = await import("node:fs/promises");
        await mkdir(dir, { recursive: true });
        await fsWriteFile(dest, imgBuffer);
      }

      await Media.collection.updateOne(
        { _id: mediaId },
        {
          $setOnInsert: {
            owner: userMap.get("arjunbuilds"),
            kind: "image",
            mime: "image/jpeg",
            bytes: imgBuffer.length,
            filename: `${mediaId}.jpg`,
            published: true,
            seedTag: DEMO_SEED_TAG,
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
      postMediaMap.set(filename, mediaUrl(mediaId));
    }
    console.log(`✓ ${postMediaMap.size} Post images ingested and published.`);

    // ─── STEP 6: SEED 28 ROOT POSTS ──────────────────────────────────────────
    console.log("\n[6/7] Seeding Public Root Posts...");
    const postMap = new Map();
    for (const p of DEMO_POSTS) {
      const postId = stableId(`post:${p.key}`);
      const authorId = userMap.get(p.authorKey);
      const postTopics = (p.topicSlugs || []).map(s => topicMap.get(s)).filter(Boolean);
      const postCircle = p.circleSlug ? circleMap.get(p.circleSlug) || null : null;
      const imageUrl = p.imageFile ? postMediaMap.get(p.imageFile) || null : null;

      const postTime = new Date(Date.now() - p.daysAgo * 86400000 - (p.hoursAgo || 0) * 3600000);
      const likedByIds = (p.likerKeys || []).map(k => userMap.get(k)).filter(Boolean);
      const retweetedByIds = (p.retweeterKeys || []).map(k => userMap.get(k)).filter(Boolean);

      await Tweet.collection.updateOne(
        { _id: postId },
        {
          $set: {
            author: authorId,
            content: p.content,
            image: imageUrl,
            audio: null,
            parentId: null,
            deletedAt: null,
            topics: postTopics,
            circle: postCircle,
            timestamp: postTime,
            likes: likedByIds.length,
            likedBy: likedByIds,
            retweets: retweetedByIds.length,
            retweetedBy: retweetedByIds,
            seedTag: DEMO_SEED_TAG,
          },
          $setOnInsert: {
            comments: 0,
          },
        },
        { upsert: true }
      );
      postMap.set(p.key, postId);

      // Bookmarks
      for (const bKey of (p.bookmarkKeys || [])) {
        const bUserId = userMap.get(bKey);
        if (bUserId) {
          await User.collection.updateOne({ _id: bUserId }, { $addToSet: { bookmarks: postId } });
        }
      }
    }
    console.log(`✓ ${postMap.size} Root posts seeded.`);

    // ─── STEP 7: SEED REPLIES & UPDATE COUNTERS ──────────────────────────────
    console.log("\n[7/7] Seeding Thread Replies & Updating Counts...");
    const replyCountPerPost = new Map();

    for (const r of DEMO_REPLIES) {
      const replyId = stableId(`reply:${r.key}`);
      const parentPostId = postMap.get(r.parentPostKey);
      const authorId = userMap.get(r.authorKey);
      const replyTime = new Date(Date.now() - r.daysAgo * 86400000 - (r.hoursAgo || 0) * 3600000);
      const likedByIds = (r.likerKeys || []).map(k => userMap.get(k)).filter(Boolean);

      await Tweet.collection.updateOne(
        { _id: replyId },
        {
          $set: {
            author: authorId,
            content: r.content,
            image: null,
            audio: null,
            parentId: parentPostId,
            deletedAt: null,
            topics: [],
            circle: null,
            timestamp: replyTime,
            likes: likedByIds.length,
            likedBy: likedByIds,
            retweets: 0,
            retweetedBy: [],
            comments: 0,
            seedTag: DEMO_SEED_TAG,
          },
        },
        { upsert: true }
      );

      const current = replyCountPerPost.get(String(parentPostId)) || 0;
      replyCountPerPost.set(String(parentPostId), current + 1);
    }

    // Update parent post comments counters
    for (const [pId, cCount] of replyCountPerPost.entries()) {
      await Tweet.collection.updateOne({ _id: new mongoose.Types.ObjectId(pId) }, { $set: { comments: cCount } });
    }

    // Update user tweet counts
    for (const [, uId] of userMap.entries()) {
      const count = await Tweet.collection.countDocuments({ author: uId, deletedAt: null });
      await User.collection.updateOne({ _id: uId }, { $set: { tweetCount: count } });
    }

    console.log(`✓ ${DEMO_REPLIES.length} Replies seeded across ${replyCountPerPost.size} discussion threads.`);

    console.log("\n==================================================");
    console.log("DEMO CONTENT SEEDING COMPLETE");
    console.log("==================================================");
    console.log(`- Users:          ${userMap.size}`);
    console.log(`- Topics:         ${topicMap.size}`);
    console.log(`- Circles:        ${circleMap.size}`);
    console.log(`- Root Posts:     ${postMap.size} (11 with images, 6+ circle posts)`);
    console.log(`- Thread Replies: ${DEMO_REPLIES.length}`);
    console.log(`- Post Images:    ${postMediaMap.size}`);
    console.log(`- Total Posts:    ${postMap.size + DEMO_REPLIES.length}`);
    console.log("==================================================\n");

    return {
      dryRun: false,
      usersCount: userMap.size,
      postsCount: postMap.size,
      imagePostsCount: postMediaMap.size,
      repliesCount: DEMO_REPLIES.length,
      topicsCount: topicMap.size,
      circlesCount: circleMap.size,
      totalPostsCount: postMap.size + DEMO_REPLIES.length,
    };
  } finally {
    if (isExternalConnection) {
      await mongoose.disconnect();
    }
  }
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith("seed-demo-content.mjs")) {
  runDemoSeeder().catch(err => {
    console.error("❌ Seed Error:", err.message);
    process.exit(1);
  });
}
