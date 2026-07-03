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

*A full-stack social media platform featuring real-time posting, media uploads, subscription plans with Razorpay payments, OTP-secured workflows, and Firebase authentication — all wrapped in a sleek, responsive UI.*

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
- Forgot password with auto-generated credentials

</td>
<td width="50%">

### 📝 Posting & Feed
- Tweet composer with **200-character limit**
- **Image upload** support via ImgBB
- **Audio tweets** with OTP verification (100 MB / 5 min max)
- Audio posting window: 2 PM – 7 PM IST
- Real-time feed sorted by latest posts

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
  - 🆓 Free — 1 tweet/month
  - 🥉 Bronze — 3 tweets/month
  - 🥈 Silver — 5 tweets/month
  - 🥇 Gold — Unlimited tweets
- **Razorpay** payment integration
- Automated **invoice emails** on payment
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
<tr><td><b>Email</b></td><td>Nodemailer</td><td>OTP, invoices, password recovery</td></tr>
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

Navigate to **[http://localhost:3000](http://localhost:3000)** 🎉

---

## 🔐 Environment Variables

### Backend — `backend/.env`

| Variable | Description | Example |
|----------|-------------|---------|
| `MONOGDB_URL` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/twiller` |
| `PORT` | Server port | `5000` |
| `RAZORPAY_KEY_ID` | Razorpay API key ID | `rzp_test_xxxxx` |
| `RAZORPAY_KEY_SECRET` | Razorpay API key secret | `secret_xxxxx` |
| `EMAIL_USER` | Sender email address | `your-email@gmail.com` |
| `EMAIL_PASS` | Email app password | `xxxx xxxx xxxx xxxx` |
| `FIREBASE_PROJECT_ID` | Firebase project identifier | `twiller-xxxxx` |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email | `firebase-adminsdk-xxx@twiller.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key | `"-----BEGIN PRIVATE KEY-----\n..."` |

### Frontend — `twiller/.env.local`

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API URL | `http://localhost:5000` |
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
| `POST` | `/retweet/:tweetid` | Retweet a tweet |
| `POST` | `/generate-audio-otp` | Send OTP for audio tweet upload |

### Subscriptions & Payments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/user-plan/:email` | Get current plan & tweet usage |
| `POST` | `/create-order` | Create Razorpay subscription order |
| `POST` | `/verify-payment` | Verify payment & upgrade plan |

---

## 🚀 Deployment

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

The application was validated through **manual testing** of the following flows:

- [x] Account signup & login (email + Google)
- [x] Chrome OTP login verification
- [x] User profile update (name, bio, avatar, location, website)
- [x] Text tweet creation & feed rendering
- [x] Image upload via ImgBB
- [x] Audio tweet upload with OTP
- [x] Like & retweet interactions
- [x] Subscription plan display & upgrade
- [x] Razorpay payment window validation
- [x] Forgot password flow
- [x] Tweet limit enforcement per plan
- [x] OTP flows for language change

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
