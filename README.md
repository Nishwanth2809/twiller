<div align="center">

# 🐦 Twiller

### A Modern Twitter/X-Inspired Social Media Platform

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-twiller--ruby.vercel.app-1DA1F2?style=for-the-badge)](https://twiller-ruby.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Firebase](https://img.shields.io/badge/Firebase-DD2C00?style=for-the-badge&logo=firebase&logoColor=white)](https://firebase.google.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

<br/>

*A full-stack social platform with posts, replies, likes, follows, bookmarks, polling-based messaging, Firebase authentication, and optional Razorpay subscriptions.*

<br/>

[🚀 Live Demo](https://twiller-ruby.vercel.app/) · [🐛 Report Bug](https://github.com/Nishwanth2809/twiller/issues) · [✨ Request Feature](https://github.com/Nishwanth2809/twiller/issues)

</div>

---

## 📑 Table of Contents

- [✨ Features](#-features)
- [🛠️ Tech Stack](#️-tech-stack)
- [🏗️ Architecture](#️-architecture)
- [📂 Project Structure](#-project-structure)
- [⚡ Quick Start](#-quick-start)
- [🔐 Environment Variables](#-environment-variables)
- [📡 API Reference](#-api-reference)
- [🚀 Deployment](#-deployment)
- [🧪 Testing](#-testing)
- [📄 License](#-license)

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🔐 Authentication & Security
- Email/password and **Google Sign-In**
- Firebase-powered authentication
- **Chrome login OTP verification** via email
- Mobile login time restriction (10 AM – 1 PM IST)
- Password recovery through Firebase-hosted reset links (email delivery must be configured)

</td>
<td width="50%">

### 📝 Posting & Feed
- Tweet composer with **200-character limit**
- Image and audio upload through the backend media endpoint (storage is deployment-configured)
- **Audio tweets** with OTP verification (100 MB / 5 min max)
- Audio posting window: 2 PM – 7 PM IST
- Feed sorted by latest posts; messages refresh through polling

</td>
</tr>
<tr>
<td width="50%">

### 💬 Social Interactions
- ❤️ Like / unlike tweets
- 🔁 Retweet functionality
- 👤 Profile pages with avatar, bio, location & website
- ✏️ Editable user profiles
- 🔔 Notification preferences

</td>
<td width="50%">

### 💳 Subscriptions & Payments
- **Tiered subscription plans:**
  - 🆓 Free — 1 post or reply per UTC calendar month
  - 🥉 Bronze — 3 posts or replies per 30-day purchase period
  - 🥈 Silver — 5 posts or replies per 30-day purchase period
  - 🥇 Gold — unlimited posts and replies per 30-day purchase period
- **Razorpay** payment integration
- Invoice email is attempted after verified payment; delivery can fail
- Payment window: 10 AM – 11 AM IST

</td>
</tr>
</table>

---

## 🛠️ Tech Stack

<table>
<tr>
<th align="center">Layer</th>
<th align="center">Technology</th>
<th align="center">Purpose</th>
</tr>
<tr><td><b>Frontend Framework</b></td><td>Next.js 15 + React 19</td><td>Server-side rendering, routing</td></tr>
<tr><td><b>Language</b></td><td>TypeScript</td><td>Type-safe development</td></tr>
<tr><td><b>Styling</b></td><td>Tailwind CSS 4</td><td>Utility-first CSS framework</td></tr>
<tr><td><b>UI Components</b></td><td>Radix UI + shadcn/ui</td><td>Accessible, composable primitives</td></tr>
<tr><td><b>Icons</b></td><td>Lucide React</td><td>Clean, consistent iconography</td></tr>
<tr><td><b>API Client</b></td><td>Axios</td><td>HTTP requests to backend</td></tr>
<tr><td><b>Backend Framework</b></td><td>Express.js 5</td><td>REST API server</td></tr>
<tr><td><b>Database</b></td><td>MongoDB + Mongoose</td><td>Document-based data persistence</td></tr>
<tr><td><b>Authentication</b></td><td>Firebase (Client + Admin SDK)</td><td>User auth & account management</td></tr>
<tr><td><b>Payments</b></td><td>Razorpay</td><td>Subscription payment processing</td></tr>
<tr><td><b>Email</b></td><td>Apps Script with SMTP fallback</td><td>Verification and recovery messages; invoice email is attempted</td></tr>
<tr><td><b>Device Detection</b></td><td>UA-Parser-JS</td><td>Browser/device session checks</td></tr>
</table>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌───────────────────────────────────────────────────────────┐     │
│   │              Next.js 15 Frontend (Vercel)                 │     │
│   │  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌────────────┐  │     │
│   │  │  Pages   │  │Components│  │Context │  │  Tailwind   │  │     │
│   │  │ (Router) │  │(Radix UI)│  │(Auth)  │  │    CSS      │  │     │
│   │  └────┬─────┘  └──────────┘  └───┬────┘  └────────────┘  │     │
│   │       │                          │                        │     │
│   │       │    Firebase Client SDK   │                        │     │
│   │       └──────────┬───────────────┘                        │     │
│   └──────────────────┼────────────────────────────────────────┘     │
│                      │  Axios HTTP                                  │
├──────────────────────┼──────────────────────────────────────────────┤
│                      ▼                                              │
│   ┌───────────────────────────────────────────────────────────┐     │
│   │           Express.js 5 Backend (Render)                   │     │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │     │
│   │  │  REST    │  │ Firebase │  │ Razorpay │  │Nodemailer│ │     │
│   │  │  Routes  │  │  Admin   │  │ Gateway  │  │  Email   │ │     │
│   │  └────┬─────┘  └──────────┘  └──────────┘  └──────────┘ │     │
│   │       │                                                   │     │
│   │       ▼                                                   │     │
│   │  ┌──────────────────────────────────┐                     │     │
│   │  │     MongoDB (Mongoose ODM)       │                     │     │
│   │  │  ┌──────┐ ┌──────┐ ┌──────────┐ │                     │     │
│   │  │  │ User │ │Tweet │ │Subscript.│ │                     │     │
│   │  │  └──────┘ └──────┘ └──────────┘ │                     │     │
│   │  └──────────────────────────────────┘                     │     │
│   └───────────────────────────────────────────────────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📂 Project Structure

```
twiller-2.0-main/
├── 📁 twiller/                    # Frontend (Next.js)
│   ├── 📁 src/
│   │   ├── 📁 app/                # App Router pages
│   │   │   ├── layout.tsx         # Root layout
│   │   │   ├── page.tsx           # Landing / home page
│   │   │   ├── globals.css        # Global styles
│   │   │   └── 📁 forgot-password/# Password recovery page
│   │   ├── 📁 components/
│   │   │   ├── Authmodel.tsx      # Auth modal (login/signup)
│   │   │   ├── Feed.tsx           # Tweet feed
│   │   │   ├── TweetCard.tsx      # Individual tweet display
│   │   │   ├── TweetComposer.tsx  # Tweet creation form
│   │   │   ├── ProfilePage.tsx    # User profile view
│   │   │   ├── Editprofile.tsx    # Profile editor
│   │   │   ├── SubscriptionPage.tsx # Plans & payments
│   │   │   ├── ForgotPassword.tsx # Password recovery flow
│   │   │   ├── Landing.tsx        # Landing page component
│   │   │   ├── 📁 layout/        # Layout components
│   │   │   └── 📁 ui/            # Reusable UI primitives
│   │   ├── 📁 context/           # React contexts (Firebase auth)
│   │   └── 📁 lib/               # Utility functions
│   ├── package.json
│   └── tsconfig.json
│
├── 📁 backend/                    # Backend (Express.js)
│   ├── index.js                   # Server entry point & all routes
│   ├── 📁 models/
│   │   ├── user.js                # User schema
│   │   ├── tweet.js               # Tweet schema
│   │   └── subscription.js        # Subscription schema
│   └── package.json
│
├── render.yaml                    # Render deployment config
├── PROJECT_REPORT.md              # Detailed project report
└── .gitignore
```

---

## ⚡ Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| [Node.js](https://nodejs.org/) | ≥ 18.x |
| [npm](https://www.npmjs.com/) | ≥ 9.x |
| [MongoDB](https://www.mongodb.com/) | Atlas or local instance |
| [Firebase Project](https://console.firebase.google.com/) | With Authentication enabled |
| [Razorpay Account](https://razorpay.com/) | For payment features |

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/Nishwanth2809/twiller.git
cd twiller
```

### 2️⃣ Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../twiller
npm install
```

### 3️⃣ Configure Environment Variables

Create the required `.env` files (see [Environment Variables](#-environment-variables) below).

### 4️⃣ Start Development Servers

```bash
# Terminal 1 — Backend
cd backend
npm run dev

# Terminal 2 — Frontend
cd twiller
npm run dev
```

### 5️⃣ Open in Browser

Navigate to **[http://localhost:3001](http://localhost:3001)** 🎉

---

## 🔐 Environment Variables

### Backend — `backend/.env`

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string. Use loopback MongoDB locally; remote development connections require `DEV_ATLAS=true` and non-production data. | `mongodb://127.0.0.1:27017/twiller` |
| `MONOGDB_URL` | Legacy alias for `MONGODB_URI` | — |
| `DEV_ATLAS` | Explicit acknowledgement for remote MongoDB during development; only use a non-production database | `true` only when needed |
| `PORT` | Server port | `5000` |
| `FRONTEND_ORIGINS` | Comma-separated allowed frontend origins; required in production | `https://your-frontend.example` |
| `PREVIEW_ORIGINS` | Optional comma-separated preview origins | — |
| `MEDIA_DIR` | Directory used for media files | Local path |
| `MEDIA_PUBLIC_BASE_URL` | Public base URL used for uploaded media links | Deployment URL |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Configure both to enable payments; use test credentials for local acceptance | Provider-issued values |
| `EMAIL_USER` / `EMAIL_PASS` | SMTP sender credentials; configure together when SMTP is used | Provider-issued values |
| `APPS_SCRIPT_URL` | Optional HTTPS Apps Script mail transport | Provider-issued URL |
| `FIREBASE_PROJECT_ID` | Firebase project identifier | Project ID |
| `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Firebase Admin credentials outside emulator mode | Service-account values |
| `TWILLER_LOCAL_AUTH_EMULATOR` | Development/test-only Firebase Auth Emulator switch | `true` |
| `FIREBASE_AUTH_EMULATOR_HOST` | Loopback Firebase Auth Emulator host and port | `127.0.0.1:9099` |

### Frontend — `twiller/.env.local`

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_BACKEND_URL` | Backend API URL; HTTPS is required in production | `http://127.0.0.1:5000` |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Razorpay public key | `rzp_test_xxxxx` |

> [!IMPORTANT]
> Never commit `.env` or `.env.local` files. They are already listed in `.gitignore`.

---

## 📡 API Reference

### Authentication & Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/register` | Register or return existing user |
| `GET` | `/loggedinuser?email=` | Fetch user by email |
| `PATCH` | `/userupdate/:email` | Update user profile |
| `POST` | `/log-session` | Log login session (applies OTP/time rules) |
| `POST` | `/verify-login-otp` | Verify Chrome login OTP |
| `POST` | `/forgot-password` | Generate & email a new password |

### Tweets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/post` | Create a new tweet |
| `GET` | `/post` | Fetch all tweets (latest first) |
| `POST` | `/like/:tweetid` | Like / unlike a tweet |
| `POST` | `/retweet/:tweetid` | Toggle the repost counter and current-user repost state; this does not distribute the post into followers&apos; feeds |
| `POST` | `/generate-audio-otp` | Send OTP for audio tweet upload |

### Subscriptions & Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/user-plan/:email` | Get current plan & tweet usage |
| `POST` | `/create-order` | Create Razorpay subscription order |
| `POST` | `/verify-payment` | Verify payment & upgrade plan |

---

## 🚀 Deployment

For the Phase 6.5 Batch 3 staging checkpoint, use [STAGING_DEPLOYMENT.md](STAGING_DEPLOYMENT.md) and the separate `render.staging.yaml`. The instructions below describe the existing live deployment and must not be used to create staging resources.

### Frontend → Vercel

The frontend is deployed on **[Vercel](https://vercel.com/)**:

```bash
# Using Vercel CLI
npx vercel --prod
```

- Set `Root Directory` to `twiller/`
- Add all `NEXT_PUBLIC_*` environment variables in the Vercel dashboard

### Backend → Render

The backend uses the included [`render.yaml`](render.yaml) for deployment on **[Render](https://render.com/)**:

- **Service type:** Web Service
- **Runtime:** Node
- **Root directory:** `backend/`
- **Build command:** `npm install`
- **Start command:** `node index.js`
- Set all backend environment variables in the Render dashboard

---

## 🧪 Testing

Run backend automated tests with `cd backend && npm test`. Run frontend lint and production compilation with `cd twiller && npm run lint` and `npm run build`. Browser acceptance, Firebase email delivery, and Razorpay checkout require their isolated test services and provider test configuration; these commands do not establish provider acceptance.

The account `language` field can store a validated preference through existing API routes, but the application interface is English-only. Repost actions currently update counters and do not distribute posts into followers&apos; feeds.

---

## 🗃️ Database Models

### User
| Field | Type | Description |
|-------|------|-------------|
| `name` | String | Display name |
| `email` | String | Unique email |
| `username` | String | Handle |
| `profileImage` | String | Avatar URL |
| `bio` | String | User biography |
| `location` | String | User location |
| `website` | String | Personal website |
| `plan` | String | Subscription tier |
| `tweetCount` | Number | Monthly tweet usage |

### Tweet
| Field | Type | Description |
|-------|------|-------------|
| `tweetedBy` | ObjectId → User | Author reference |
| `content` | String | Tweet text (200 char max) |
| `image` | String | Image URL (optional) |
| `audio` | String | Audio URL (optional) |
| `likes` | [ObjectId] | Users who liked |
| `retweetedBy` | [ObjectId] | Users who retweeted |
| `createdAt` | Date | Timestamp |

### Subscription
| Field | Type | Description |
|-------|------|-------------|
| `email` | String | User email |
| `plan` | String | Plan name |
| `orderId` | String | Razorpay order ID |
| `paymentId` | String | Razorpay payment ID |

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

---

## 📄 License

This project is open source and available under the [ISC License](https://opensource.org/licenses/ISC).

---

<div align="center">

**Built with ❤️ by [Nishwanth](https://github.com/Nishwanth2809)**

⭐ Star this repo if you found it useful!

</div>
