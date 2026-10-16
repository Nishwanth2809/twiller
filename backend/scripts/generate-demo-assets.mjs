import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "seed-assets");

function xmlEscape(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function avatarSvg(name, title, bg1, bg2, accent, iconSvg) {
  return `<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bg1}" />
      <stop offset="100%" stop-color="${bg2}" />
    </linearGradient>
    <linearGradient id="acc" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.8" />
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.2" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.5"/>
    </filter>
  </defs>
  <rect width="400" height="400" fill="url(#bg)" />
  <circle cx="200" cy="200" r="170" fill="none" stroke="${accent}" stroke-width="2" stroke-opacity="0.3" stroke-dasharray="8 6" />
  <circle cx="200" cy="170" r="80" fill="url(#acc)" filter="url(#shadow)" />
  <g transform="translate(150, 120)" stroke="${accent}" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    ${iconSvg}
  </g>
  <text x="200" y="295" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">${xmlEscape(name)}</text>
  <text x="200" y="325" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="500" fill="${accent}" text-anchor="middle" letter-spacing="1">${xmlEscape(title)}</text>
</svg>`;
}

function postImageSvg(title, subtitle, tag, bg1, bg2, accent, bodySvg) {
  return `<svg width="1200" height="700" viewBox="0 0 1200 700" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="pbg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bg1}" />
      <stop offset="100%" stop-color="${bg2}" />
    </linearGradient>
    <linearGradient id="pacc" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accent}" />
      <stop offset="100%" stop-color="#ffffff" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="30" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="1200" height="700" fill="url(#pbg)" />
  
  <!-- Ambient background grid and glow -->
  <g opacity="0.1" stroke="#ffffff" stroke-width="1">
    <line x1="0" y1="140" x2="1200" y2="140" />
    <line x1="0" y1="280" x2="1200" y2="280" />
    <line x1="0" y1="420" x2="1200" y2="420" />
    <line x1="0" y1="560" x2="1200" y2="560" />
    <line x1="240" y1="0" x2="240" y2="700" />
    <line x1="480" y1="0" x2="480" y2="700" />
    <line x1="720" y1="0" x2="720" y2="700" />
    <line x1="960" y1="0" x2="960" y2="700" />
  </g>
  <circle cx="950" cy="250" r="180" fill="${accent}" opacity="0.15" filter="url(#glow)" />
  
  <!-- Card framing -->
  <rect x="60" y="60" width="1080" height="580" rx="24" fill="#030712" fill-opacity="0.6" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1.5" />
  
  <!-- Badge Tag -->
  <rect x="110" y="110" width="${tag.length * 11 + 32}" height="34" rx="17" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-opacity="0.4" />
  <text x="126" y="133" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" fill="${accent}" letter-spacing="1.5">${xmlEscape(tag.toUpperCase())}</text>
  
  <!-- Header Text -->
  <text x="110" y="200" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="38" font-weight="800" fill="#ffffff" letter-spacing="-0.5">${xmlEscape(title)}</text>
  <text x="110" y="240" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="400" fill="#9ca3af">${xmlEscape(subtitle)}</text>

  <!-- Illustration Body -->
  <g transform="translate(110, 280)">
    ${bodySvg}
  </g>
  
  <!-- Watermark -->
  <text x="1100" y="600" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#4b5563" text-anchor="end">Twiller Discovery</text>
</svg>`;
}

export const AVATAR_SPECS = [
  {
    filename: "avatar_maya.jpg",
    name: "Maya Chen",
    title: "AI / ML ENGINEER",
    bg1: "#0f172a",
    bg2: "#312e81",
    accent: "#818cf8",
    icon: `<circle cx="50" cy="40" r="28" /><path d="M25 80 Q50 60 75 80" /><path d="M15 35 L30 45 L50 25 L70 45 L85 35" stroke-dasharray="3 3"/>`,
  },
  {
    filename: "avatar_arjun.jpg",
    name: "Arjun Rao",
    title: "FULL-STACK DEV",
    bg1: "#022c22",
    bg2: "#064e3b",
    accent: "#34d399",
    icon: `<path d="M35 30 L15 50 L35 70" /><path d="M65 30 L85 50 L65 70" /><line x1="55" y1="20" x2="45" y2="80" />`,
  },
  {
    filename: "avatar_sofia.jpg",
    name: "Sofia Martinez",
    title: "PHOTOGRAPHER",
    bg1: "#450a0a",
    bg2: "#881337",
    accent: "#fb7185",
    icon: `<rect x="15" y="25" width="70" height="50" rx="8" /><circle cx="50" cy="50" r="16" /><path d="M35 25 L42 15 L58 15 L65 25" />`,
  },
  {
    filename: "avatar_liam.jpg",
    name: "Liam Carter",
    title: "STARTUP FOUNDER",
    bg1: "#172554",
    bg2: "#1e3a8a",
    accent: "#60a5fa",
    icon: `<path d="M50 15 L70 45 L58 45 L62 80 L38 80 L42 45 L30 45 Z" /><circle cx="50" cy="35" r="5" />`,
  },
  {
    filename: "avatar_priya.jpg",
    name: "Priya Nair",
    title: "UI / UX DESIGNER",
    bg1: "#3b0764",
    bg2: "#581c87",
    accent: "#c084fc",
    icon: `<path d="M20 75 L45 25 L70 75 Z" /><path d="M30 60 Q50 40 70 60" /><circle cx="50" cy="35" r="8" fill="#c084fc" />`,
  },
  {
    filename: "avatar_noah.jpg",
    name: "Noah Williams",
    title: "DEVOPS & CLOUD",
    bg1: "#082f49",
    bg2: "#0c4a6e",
    accent: "#38bdf8",
    icon: `<path d="M25 60 A18 18 0 0 1 35 30 A24 24 0 0 1 70 30 A18 18 0 0 1 80 60 Z" /><path d="M40 75 L60 75" />`,
  },
  {
    filename: "avatar_aisha.jpg",
    name: "Aisha Khan",
    title: "DATA SCIENTIST",
    bg1: "#14532d",
    bg2: "#166534",
    accent: "#4ade80",
    icon: `<circle cx="30" cy="30" r="10" /><circle cx="70" cy="30" r="10" /><circle cx="50" cy="70" r="10" /><line x1="30" y1="30" x2="50" y2="70" /><line x1="70" y1="30" x2="50" y2="70" /><line x1="30" y1="30" x2="70" y2="30" />`,
  },
  {
    filename: "avatar_ethan.jpg",
    name: "Ethan Brooks",
    title: "TECH & WRITING",
    bg1: "#451a03",
    bg2: "#78350f",
    accent: "#fbbf24",
    icon: `<rect x="25" y="20" width="50" height="60" rx="4" /><line x1="35" y1="35" x2="65" y2="35" /><line x1="35" y1="50" x2="65" y2="50" /><line x1="35" y1="65" x2="55" y2="65" />`,
  },
];

export const POST_IMAGE_SPECS = [
  {
    filename: "post_desk_setup.jpg",
    tag: "Workspace",
    title: "Minimalist Engineering Setup",
    subtitle: "Custom 65% split keyboard, 34-inch curved ultrawide, and warm ambient light.",
    bg1: "#0f172a",
    bg2: "#1e1b4b",
    accent: "#6366f1",
    body: `
      <rect x="0" y="20" width="980" height="260" rx="16" fill="#1e293b" fill-opacity="0.5" stroke="#475569" stroke-width="1.5" />
      <rect x="40" y="50" width="500" height="180" rx="8" fill="#0f172a" stroke="#6366f1" stroke-width="2" />
      <rect x="60" y="70" width="180" height="15" rx="3" fill="#6366f1" opacity="0.6" />
      <rect x="60" y="95" width="320" height="8" rx="2" fill="#94a3b8" opacity="0.4" />
      <rect x="60" y="112" width="280" height="8" rx="2" fill="#94a3b8" opacity="0.4" />
      <rect x="60" y="130" width="400" height="8" rx="2" fill="#94a3b8" opacity="0.3" />
      <rect x="580" y="70" width="340" height="140" rx="12" fill="#111827" stroke="#374151" stroke-width="1.5" />
      <text x="610" y="115" font-family="monospace" font-size="14" fill="#a5b4fc">➜  workspace git:(main)</text>
      <text x="610" y="145" font-family="monospace" font-size="14" fill="#34d399">✓ 0 lint errors, 42 tests passed</text>
      <text x="610" y="175" font-family="monospace" font-size="14" fill="#60a5fa">Ready for production demo</text>
    `,
  },
  {
    filename: "post_code_editor.jpg",
    tag: "Development",
    title: "Clean API Route Decomposition",
    subtitle: "Refactoring nested conditionals into composable middleware handlers.",
    bg1: "#022c22",
    bg2: "#0f172a",
    accent: "#10b981",
    body: `
      <rect x="0" y="20" width="980" height="260" rx="16" fill="#02140e" stroke="#059669" stroke-width="1.5" />
      <circle cx="35" cy="45" r="6" fill="#ef4444" />
      <circle cx="55" cy="45" r="6" fill="#f59e0b" />
      <circle cx="75" cy="45" r="6" fill="#10b981" />
      <text x="110" y="49" font-family="monospace" font-size="13" fill="#6ee7b7">routes/api/v2/pipeline.ts</text>
      <text x="35" y="90" font-family="monospace" font-size="15" fill="#f43f5e">export const</text>
      <text x="160" y="90" font-family="monospace" font-size="15" fill="#60a5fa">pipelineHandler</text>
      <text x="310" y="90" font-family="monospace" font-size="15" fill="#e2e8f0">= compose(</text>
      <text x="70" y="125" font-family="monospace" font-size="15" fill="#a7f3d0">validatePayload(Schema),</text>
      <text x="70" y="155" font-family="monospace" font-size="15" fill="#a7f3d0">verifyRateLimit({ windowSecs: 60, max: 120 }),</text>
      <text x="70" y="185" font-family="monospace" font-size="15" fill="#a7f3d0">authenticateUserSession,</text>
      <text x="70" y="215" font-family="monospace" font-size="15" fill="#f59e0b">executeTransformStream</text>
      <text x="35" y="245" font-family="monospace" font-size="15" fill="#e2e8f0">);</text>
    `,
  },
  {
    filename: "post_city_skyline.jpg",
    tag: "Photography",
    title: "Golden Hour Over Barcelona",
    subtitle: "Late afternoon light cutting through Gothic architectural facades.",
    bg1: "#431407",
    bg2: "#7c2d12",
    accent: "#fb923c",
    body: `
      <rect x="0" y="20" width="980" height="260" rx="16" fill="#1c0a00" stroke="#ea580c" stroke-width="1.5" />
      <!-- Stylized skyline -->
      <polygon points="50,280 50,140 110,140 110,280" fill="#7c2d12" opacity="0.7"/>
      <polygon points="120,280 120,90 190,90 190,280" fill="#9a3412" opacity="0.8"/>
      <polygon points="200,280 200,160 270,160 270,280" fill="#c2410c" opacity="0.9"/>
      <polygon points="280,280 340,60 400,280" fill="#ea580c"/>
      <polygon points="410,280 410,120 490,120 490,280" fill="#9a3412" opacity="0.8"/>
      <polygon points="500,280 500,180 580,180 580,280" fill="#7c2d12" opacity="0.7"/>
      <polygon points="590,280 650,100 710,280" fill="#c2410c"/>
      <polygon points="720,280 720,150 820,150 820,280" fill="#ea580c" opacity="0.85"/>
      <circle cx="880" cy="110" r="45" fill="#fed7aa" opacity="0.9" />
    `,
  },
  {
    filename: "post_mountain_travel.jpg",
    tag: "Nature & Travel",
    title: "Sunrise at Alpine Ridge",
    subtitle: "High elevation trail above the tree line at 2,400 meters.",
    bg1: "#0f172a",
    bg2: "#042f2e",
    accent: "#2dd4bf",
    body: `
      <rect x="0" y="20" width="980" height="260" rx="16" fill="#021c1a" stroke="#0d9488" stroke-width="1.5" />
      <polygon points="20,280 220,90 420,280" fill="#115e59" opacity="0.7" />
      <polygon points="260,280 500,60 740,280" fill="#0f766e" opacity="0.9" />
      <polygon points="580,280 780,110 960,280" fill="#14b8a6" opacity="0.6" />
      <circle cx="500" cy="60" r="18" fill="#ccfbf1" opacity="0.8" />
      <polyline points="100,270 300,220 500,240 700,200 900,250" fill="none" stroke="#5eead4" stroke-width="3" stroke-dasharray="6 4" />
    `,
  },
  {
    filename: "post_coffee_workspace.jpg",
    tag: "Ritual & Focus",
    title: "Morning Writing Workflow",
    subtitle: "First 90 minutes of the morning: zero notifications, pure synthesis.",
    bg1: "#291500",
    bg2: "#451a03",
    accent: "#f59e0b",
    body: `
      <rect x="0" y="20" width="980" height="260" rx="16" fill="#1c0f00" stroke="#b45309" stroke-width="1.5" />
      <circle cx="200" cy="150" r="70" fill="#78350f" stroke="#d97706" stroke-width="3" />
      <circle cx="200" cy="150" r="50" fill="#451a03" />
      <path d="M185 130 Q200 110 215 130 Q200 170 185 130" fill="#fde68a" opacity="0.9" />
      <rect x="360" y="60" width="560" height="180" rx="12" fill="#292524" stroke="#57534e" stroke-width="1.5" />
      <text x="390" y="105" font-family="-apple-system, sans-serif" font-size="20" font-weight="700" fill="#fef3c7">Priority Protocol for 08:00–09:30</text>
      <text x="390" y="145" font-family="-apple-system, sans-serif" font-size="15" fill="#d6d3d1">1. Review retrieval benchmark edge cases</text>
      <text x="390" y="175" font-family="-apple-system, sans-serif" font-size="15" fill="#d6d3d1">2. Complete semantic chunk deduplication logic</text>
      <text x="390" y="205" font-family="-apple-system, sans-serif" font-size="15" fill="#d6d3d1">3. Write engineering handoff brief</text>
    `,
  },
  {
    filename: "post_ui_mockup.jpg",
    tag: "Design Systems",
    title: "Dark Mode Analytics Component",
    subtitle: "High contrast data visualization cards with WCAG AAA accessibility.",
    bg1: "#2e1065",
    bg2: "#1e1b4b",
    accent: "#a855f7",
    body: `
      <rect x="0" y="20" width="980" height="260" rx="16" fill="#13072b" stroke="#7e22ce" stroke-width="1.5" />
      <rect x="50" y="60" width="260" height="180" rx="12" fill="#1e1b4b" stroke="#6366f1" stroke-width="1.5" />
      <text x="75" y="95" font-family="-apple-system, sans-serif" font-size="13" font-weight="600" fill="#a5b4fc">QUERY LATENCY</text>
      <text x="75" y="135" font-family="-apple-system, sans-serif" font-size="32" font-weight="800" fill="#ffffff">18.4ms</text>
      <text x="75" y="165" font-family="-apple-system, sans-serif" font-size="13" fill="#34d399">↓ 34% after indexing</text>
      <rect x="360" y="60" width="260" height="180" rx="12" fill="#1e1b4b" stroke="#a855f7" stroke-width="1.5" />
      <text x="385" y="95" font-family="-apple-system, sans-serif" font-size="13" font-weight="600" fill="#d8b4fe">P99 CACHE HIT</text>
      <text x="385" y="135" font-family="-apple-system, sans-serif" font-size="32" font-weight="800" fill="#ffffff">99.1%</text>
      <text x="385" y="165" font-family="-apple-system, sans-serif" font-size="13" fill="#34d399">↑ 4.2% week over week</text>
      <rect x="670" y="60" width="260" height="180" rx="12" fill="#1e1b4b" stroke="#ec4899" stroke-width="1.5" />
      <text x="695" y="95" font-family="-apple-system, sans-serif" font-size="13" font-weight="600" fill="#f472b6">THROUGHPUT</text>
      <text x="695" y="135" font-family="-apple-system, sans-serif" font-size="32" font-weight="800" fill="#ffffff">4,820</text>
      <text x="695" y="165" font-family="-apple-system, sans-serif" font-size="13" fill="#93c5fd">req / sec nominal</text>
    `,
  },
  {
    filename: "post_cloud_server.jpg",
    tag: "Infrastructure",
    title: "Zero-Downtime Migration Cluster",
    subtitle: "Real-time replica synchronization during automated regional failover testing.",
    bg1: "#032b43",
    bg2: "#021a29",
    accent: "#38bdf8",
    body: `
      <rect x="0" y="20" width="980" height="260" rx="16" fill="#01131e" stroke="#0284c7" stroke-width="1.5" />
      <!-- Server racks -->
      <g transform="translate(60, 60)">
        <rect x="0" y="0" width="180" height="180" rx="8" fill="#0c2333" stroke="#38bdf8" stroke-width="1.5" />
        <circle cx="25" cy="30" r="4" fill="#4ade80" /> <line x1="45" y1="30" x2="160" y2="30" stroke="#0284c7" stroke-width="2" />
        <circle cx="25" cy="65" r="4" fill="#4ade80" /> <line x1="45" y1="65" x2="160" y2="65" stroke="#0284c7" stroke-width="2" />
        <circle cx="25" cy="100" r="4" fill="#38bdf8" /> <line x1="45" y1="100" x2="160" y2="100" stroke="#0284c7" stroke-width="2" />
        <circle cx="25" cy="135" r="4" fill="#4ade80" /> <line x1="45" y1="135" x2="160" y2="135" stroke="#0284c7" stroke-width="2" />
      </g>
      <path d="M260 150 L380 150" stroke="#38bdf8" stroke-width="3" stroke-dasharray="6 4" />
      <g transform="translate(400, 60)">
        <rect x="0" y="0" width="180" height="180" rx="8" fill="#0c2333" stroke="#38bdf8" stroke-width="1.5" />
        <circle cx="25" cy="30" r="4" fill="#4ade80" /> <line x1="45" y1="30" x2="160" y2="30" stroke="#0284c7" stroke-width="2" />
        <circle cx="25" cy="65" r="4" fill="#4ade80" /> <line x1="45" y1="65" x2="160" y2="65" stroke="#0284c7" stroke-width="2" />
        <circle cx="25" cy="100" r="4" fill="#4ade80" /> <line x1="45" y1="100" x2="160" y2="100" stroke="#0284c7" stroke-width="2" />
        <circle cx="25" cy="135" r="4" fill="#4ade80" /> <line x1="45" y1="135" x2="160" y2="135" stroke="#0284c7" stroke-width="2" />
      </g>
      <text x="640" y="125" font-family="monospace" font-size="16" fill="#38bdf8">PRIMARY ⇄ REPLICA</text>
      <text x="640" y="155" font-family="monospace" font-size="14" fill="#4ade80">STATUS: IN_SYNC (lag: 0ms)</text>
      <text x="640" y="185" font-family="monospace" font-size="14" fill="#94a3b8">HA failover readiness: PASS</text>
    `,
  },
  {
    filename: "post_ai_neural.jpg",
    tag: "Machine Learning",
    title: "Graph Neural Representations",
    subtitle: "Visualizing topological node embeddings and semantic vector clusters.",
    bg1: "#18002e",
    bg2: "#0b0017",
    accent: "#c084fc",
    body: `
      <rect x="0" y="20" width="980" height="260" rx="16" fill="#070010" stroke="#9333ea" stroke-width="1.5" />
      <g stroke="#a855f7" stroke-width="2" opacity="0.6">
        <line x1="120" y1="80" x2="260" y2="140" />
        <line x1="120" y1="200" x2="260" y2="140" />
        <line x1="260" y1="140" x2="420" y2="90" />
        <line x1="260" y1="140" x2="420" y2="190" />
        <line x1="420" y1="90" x2="600" y2="130" />
        <line x1="420" y1="190" x2="600" y2="130" />
      </g>
      <circle cx="120" cy="80" r="16" fill="#7e22ce" stroke="#e9d5ff" stroke-width="2" />
      <circle cx="120" cy="200" r="16" fill="#7e22ce" stroke="#e9d5ff" stroke-width="2" />
      <circle cx="260" cy="140" r="22" fill="#9333ea" stroke="#ffffff" stroke-width="2" />
      <circle cx="420" cy="90" r="18" fill="#a855f7" stroke="#ffffff" stroke-width="2" />
      <circle cx="420" cy="190" r="18" fill="#a855f7" stroke="#ffffff" stroke-width="2" />
      <circle cx="600" cy="130" r="24" fill="#c084fc" stroke="#ffffff" stroke-width="3" />
      <text x="680" y="125" font-family="monospace" font-size="16" fill="#e9d5ff">Cosine Similarity: 0.942</text>
      <text x="680" y="155" font-family="monospace" font-size="14" fill="#a855f7">Embedding Dimension: 768</text>
      <text x="680" y="185" font-family="monospace" font-size="14" fill="#94a3b8">Topological clustering active</text>
    `,
  },
  {
    filename: "post_productivity_planner.jpg",
    tag: "Productivity",
    title: "Deep Work Schedule Block",
    subtitle: "Protecting four-hour uninterrupted focus blocks on key project milestones.",
    bg1: "#1e293b",
    bg2: "#0f172a",
    accent: "#38bdf8",
    body: `
      <rect x="0" y="20" width="980" height="260" rx="16" fill="#020617" stroke="#334155" stroke-width="1.5" />
      <rect x="50" y="60" width="280" height="180" rx="10" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5" />
      <text x="75" y="95" font-family="-apple-system, sans-serif" font-size="16" font-weight="700" fill="#38bdf8">09:00 — 13:00</text>
      <text x="75" y="125" font-family="-apple-system, sans-serif" font-size="20" font-weight="800" fill="#ffffff">Deep Work Block</text>
      <text x="75" y="155" font-family="-apple-system, sans-serif" font-size="14" fill="#94a3b8">DMs / Mail / Slack: OFF</text>
      <text x="75" y="185" font-family="-apple-system, sans-serif" font-size="14" fill="#34d399">Output: Core implementation</text>
      <rect x="370" y="60" width="560" height="180" rx="10" fill="#0f172a" stroke="#475569" stroke-width="1.5" />
      <text x="400" y="100" font-family="-apple-system, sans-serif" font-size="15" fill="#e2e8f0">Rule: Protect the highest cognitive energy window.</text>
      <text x="400" y="135" font-family="-apple-system, sans-serif" font-size="14" fill="#94a3b8">Meetings and asynchronous check-ins are restricted to afternoons.</text>
      <text x="400" y="170" font-family="-apple-system, sans-serif" font-size="14" fill="#38bdf8">Result: 3x increase in finished pull requests.</text>
    `,
  },
  {
    filename: "post_street_photo.jpg",
    tag: "Street Scenes",
    title: "Rain Reflections on Cobblestone",
    subtitle: "Moody urban reflections right after an autumn evening downpour.",
    bg1: "#0a0a0a",
    bg2: "#171717",
    accent: "#f43f5e",
    body: `
      <rect x="0" y="20" width="980" height="260" rx="16" fill="#050505" stroke="#3f3f46" stroke-width="1.5" />
      <!-- Neon street reflections -->
      <ellipse cx="250" cy="220" rx="180" ry="25" fill="#f43f5e" opacity="0.3" filter="url(#glow)" />
      <ellipse cx="650" cy="230" rx="220" ry="30" fill="#38bdf8" opacity="0.25" filter="url(#glow)" />
      <line x1="50" y1="210" x2="930" y2="210" stroke="#52525b" stroke-width="2" stroke-dasharray="20 15" />
      <circle cx="250" cy="110" r="12" fill="#f43f5e" />
      <circle cx="280" cy="95" r="8" fill="#fb7185" />
      <circle cx="650" cy="110" r="14" fill="#38bdf8" />
      <circle cx="700" cy="125" r="10" fill="#60a5fa" />
      <text x="500" y="160" font-family="-apple-system, sans-serif" font-size="18" font-style="italic" fill="#e4e4e7" text-anchor="middle">50mm f/1.2 · ISO 800 · 1/160s</text>
    `,
  },
  {
    filename: "post_architecture_diagram.jpg",
    tag: "System Design",
    title: "Event-Driven Stream Architecture",
    subtitle: "Decoupling high-write ingestion with message brokers and read-optimized caches.",
    bg1: "#022c22",
    bg2: "#064e3b",
    accent: "#34d399",
    body: `
      <rect x="0" y="20" width="980" height="260" rx="16" fill="#02140e" stroke="#059669" stroke-width="1.5" />
      <!-- Client -->
      <rect x="60" y="90" width="140" height="110" rx="10" fill="#064e3b" stroke="#34d399" stroke-width="1.5" />
      <text x="130" y="140" font-family="monospace" font-size="14" fill="#a7f3d0" text-anchor="middle">Client App</text>
      <text x="130" y="165" font-family="monospace" font-size="12" fill="#6ee7b7" text-anchor="middle">HTTP / WS</text>
      <!-- Arrow -->
      <path d="M210 145 L290 145" stroke="#34d399" stroke-width="2" marker-end="url(#arrow)" />
      <!-- Gateway -->
      <rect x="300" y="90" width="160" height="110" rx="10" fill="#064e3b" stroke="#34d399" stroke-width="1.5" />
      <text x="380" y="140" font-family="monospace" font-size="14" fill="#a7f3d0" text-anchor="middle">API Boundary</text>
      <text x="380" y="165" font-family="monospace" font-size="12" fill="#6ee7b7" text-anchor="middle">Auth &amp; RateLimit</text>
      <!-- Arrow -->
      <path d="M470 145 L550 145" stroke="#34d399" stroke-width="2" />
      <!-- Queue -->
      <rect x="560" y="90" width="160" height="110" rx="10" fill="#064e3b" stroke="#34d399" stroke-width="1.5" />
      <text x="640" y="140" font-family="monospace" font-size="14" fill="#a7f3d0" text-anchor="middle">Event Broker</text>
      <text x="640" y="165" font-family="monospace" font-size="12" fill="#6ee7b7" text-anchor="middle">Kafka / Stream</text>
      <!-- Arrow -->
      <path d="M730 145 L800 145" stroke="#34d399" stroke-width="2" />
      <!-- Worker -->
      <rect x="810" y="90" width="120" height="110" rx="10" fill="#064e3b" stroke="#34d399" stroke-width="1.5" />
      <text x="870" y="140" font-family="monospace" font-size="14" fill="#a7f3d0" text-anchor="middle">Consumers</text>
      <text x="870" y="165" font-family="monospace" font-size="12" fill="#6ee7b7" text-anchor="middle">Workers</text>
    `,
  },
];

export async function generateAllAssets(outputDir = ASSETS_DIR) {
  await mkdir(outputDir, { recursive: true });

  const generated = [];

  // Generate Avatars
  for (const spec of AVATAR_SPECS) {
    const svg = avatarSvg(spec.name, spec.title, spec.bg1, spec.bg2, spec.accent, spec.icon);
    const jpegBuffer = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
    const filePath = path.join(outputDir, spec.filename);
    await writeFile(filePath, jpegBuffer);
    generated.push({ name: spec.filename, bytes: jpegBuffer.length, type: "avatar" });
  }

  // Generate Post Images
  for (const spec of POST_IMAGE_SPECS) {
    const svg = postImageSvg(spec.title, spec.subtitle, spec.tag, spec.bg1, spec.bg2, spec.accent, spec.body);
    const jpegBuffer = await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
    const filePath = path.join(outputDir, spec.filename);
    await writeFile(filePath, jpegBuffer);
    generated.push({ name: spec.filename, bytes: jpegBuffer.length, type: "post_image" });
  }

  return generated;
}

if (process.argv[1] && process.argv[1].endsWith("generate-demo-assets.mjs")) {
  console.log(`Generating demo visual assets in: ${ASSETS_DIR}...`);
  const items = await generateAllAssets();
  console.log(`Successfully generated ${items.length} assets (${items.filter(i => i.type === "avatar").length} avatars, ${items.filter(i => i.type === "post_image").length} post images).`);
}
