# ⚡ VibeVerse — Backend

The **Node.js + Express + Socket.IO** API server for VibeVerse — powering real-time messaging, WebRTC signaling, communities, stories, memories, multiplayer games, and email-based OTP authentication.

---

## 🛠️ Tech Stack

| Category | Technologies |
| :--- | :--- |
| **Runtime** | Node.js (ESM) `>= 20.0.0` |
| **Framework** | Express 4 |
| **Real-Time** | Socket.IO 4 (signaling, presence, chat, games) |
| **Database** | MongoDB via Mongoose 8 |
| **Authentication** | JWT (HttpOnly cookies) + BcryptJS password hashing |
| **Email / OTP** | Brevo (Sendinblue) Transactional Email API |
| **File Storage** | Cloudinary (avatars, community icons, memories, stories) |
| **Security** | Arcjet (bot protection, rate limiting), express-rate-limit |
| **Dev Tools** | Nodemon (hot-reload) |

---

## 📁 Project Structure

```text
backend/
├── src/
│   ├── controllers/               # Business logic handlers
│   │   ├── auth.controller.js         # Signup, login, logout, OTP, password reset
│   │   ├── call.controller.js         # Call history logging
│   │   ├── community.controller.js    # Community CRUD, rooms, invitations, moderation
│   │   ├── friend.controller.js       # Friend requests, accept/reject, unfriend
│   │   ├── game.controller.js         # Multiplayer game creation & moves
│   │   ├── gameScore.controller.js    # Game leaderboard & score tracking
│   │   ├── memory.controller.js       # Personal memories CRUD
│   │   ├── message.controller.js      # 1-to-1 chat messages & media
│   │   └── story.controller.js        # 24-hour ephemeral stories
│   ├── middleware/                 # Express & Socket.IO middleware
│   │   ├── auth.middleware.js         # JWT cookie verification (HTTP routes)
│   │   ├── rateLimiter.middleware.js   # API rate limiting
│   │   └── socket.auth.middleware.js   # JWT verification for Socket.IO connections
│   ├── models/                    # MongoDB Mongoose schemas
│   │   ├── User.js                    # User profile & credentials
│   │   ├── Message.js                 # Direct messages
│   │   ├── Call.js                    # Call logs (audio/video)
│   │   ├── Community.js               # Community metadata & settings
│   │   ├── CommunityRoom.js           # Community chat rooms
│   │   ├── CommunityMessage.js        # Community room messages
│   │   ├── CommunityInvitation.js     # Community join invitations
│   │   ├── FriendRequest.js           # Friend request records
│   │   ├── Game.js                    # Active & completed game states
│   │   ├── GameScore.js               # Player score aggregation
│   │   ├── Memory.js                  # Personal memories with media
│   │   ├── Story.js                   # 24-hour stories
│   │   └── OTP.js                     # Email OTP tokens
│   ├── routes/                    # Express API route definitions
│   │   ├── auth.route.js              # /api/auth/*
│   │   ├── call.route.js              # /api/calls/*
│   │   ├── community.route.js         # /api/communities/*
│   │   ├── friend.route.js            # /api/friends/*
│   │   ├── game.route.js              # /api/games/*
│   │   ├── gameScore.route.js         # /api/game-scores/*
│   │   ├── memory.route.js            # /api/memories/*
│   │   ├── message.route.js           # /api/messages/*
│   │   ├── story.route.js             # /api/stories/*
│   │   └── user.route.js              # /api/users/*
│   ├── lib/                       # Core infrastructure & config
│   │   ├── db.js                      # MongoDB connection with retry logic
│   │   ├── env.js                     # Environment variable validation & export
│   │   ├── socket.js                  # Socket.IO server setup & event handlers
│   │   ├── cloudinary.js              # Cloudinary SDK configuration
│   │   ├── brevo.js                   # Brevo email API client
│   │   └── utils.js                   # Shared utility functions
│   ├── services/                  # Business service layer
│   │   ├── emailService.js            # Email template rendering & sending (OTPs, verification)
│   │   ├── gameEngine.js              # Game logic engine (Chess, Connect-4, Tic-Tac-Toe)
│   │   └── otpService.js             # OTP generation, validation & expiry
│   ├── emails/                    # HTML email templates
│   ├── constants/                 # App-wide constants
│   ├── app.js                     # Express app setup, CORS, middleware, health & error handling
│   └── server.js                  # HTTP & Socket.IO server startup entry
├── .env.example                   # Environment variable template
├── .env                           # Local dev environment (gitignored)
└── package.json                   # Dependencies & scripts
```

---

## ⚙️ Environment Variables

Copy the template and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description | Example |
| :--- | :--- | :--- |
| `PORT` | Server listening port | `5000` |
| `NODE_ENV` | Environment mode | `development` or `production` |
| `MONGO_URI` | MongoDB Atlas connection string | `mongodb+srv://<user>:<pass>@cluster0.mongodb.net/VibeVerse?retryWrites=true&w=majority` |
| `JWT_SECRET` | Secret key for signing JWT tokens | A random 64-character string |
| `CLIENT_URL` | Allowed frontend origin(s) for CORS & Sockets | `https://your-app.vercel.app` (comma-separated for multiple) |
| `COOKIE_SAME_SITE` | Cookie SameSite attribute | `none` (cross-domain) or `lax` (same-domain/local) |
| `BREVO_API_KEY` | Brevo transactional email API key | `xkeysib-...` |
| `EMAIL_FROM` | Verified sender email on Brevo | `yourname@gmail.com` |
| `EMAIL_FROM_NAME` | Display name in outgoing emails | `VibeVerse` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | `your_cloud_name` |
| `CLOUDINARY_API_KEY` | Cloudinary API key | `123456789012345` |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | `your_api_secret` |

> [!IMPORTANT]
> **Keep `.env` gitignored.** Never commit secrets to version control.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** `>= 20.0.0`
- **npm** `>= 10.0.0`
- **MongoDB Atlas** cluster (or local MongoDB instance)
- **Cloudinary** account (free tier works)
- **Brevo** account with a verified sender email

### Installation

```bash
# Navigate to the backend directory
cd backend

# Install dependencies
npm install
```

### Development (with hot-reload)

```bash
npm run dev
```

Starts the server using **Nodemon** on the configured `PORT` (default: `5000`).

### Production

```bash
npm start
```

Runs `node src/server.js` directly.

---

## 🔌 API Routes

All routes are prefixed with `/api`.

| Prefix | Resource | Key Endpoints |
| :--- | :--- | :--- |
| `/api/auth` | Authentication | Signup, login, logout, send OTP, verify OTP, forgot/reset password |
| `/api/users` | Users | Get user profile, search users |
| `/api/messages` | Direct Messages | Send text/image/voice message, get conversation history |
| `/api/friends` | Friends | Send/accept/reject request, unfriend, list friends |
| `/api/communities` | Communities | Create, join, leave, manage rooms, moderate members |
| `/api/stories` | Stories | Create, view, delete (auto-expire after 24h) |
| `/api/memories` | Memories | Create, view, delete personal memories |
| `/api/games` | Games | Create game, make move, get game state |
| `/api/game-scores` | Leaderboard | Get scores, update rankings |
| `/api/calls` | Calls | Log call history |

### Health Check

```
GET /health
```

Returns:
```json
{
  "success": true,
  "service": "VibeVerse API",
  "status": "healthy",
  "dbReady": true,
  "timestamp": "2026-09-01T10:00:00.000Z"
}
```

---

## 🔄 Real-Time Events (Socket.IO)

The Socket.IO server (configured in [`src/lib/socket.js`](src/lib/socket.js)) handles:

| Feature | Events |
| :--- | :--- |
| **Presence** | User online/offline status tracking |
| **Chat** | New message delivery, typing indicators, message read receipts |
| **Calls** | WebRTC signaling (offer, answer, ICE candidates), call initiation & termination |
| **Games** | Game invites, move broadcasting, game completion notifications |
| **Communities** | Room join/leave, community message broadcasting |
| **Friends** | Friend request notifications, accept/reject updates |
| **Stories** | New story notifications |

All Socket.IO connections are authenticated via JWT cookies using the [`socket.auth.middleware.js`](src/middleware/socket.auth.middleware.js).

---

## 🌐 Deployment (Render / Railway)

Since Socket.IO requires persistent WebSocket connections, deploy as a **Web Service** (not a serverless function).

### 1. Create Web Service on Render

1. Push code to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com/) → **New +** → **Web Service**.
3. Connect your repository.
4. Configure:
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### 2. Set Environment Variables

Add all variables from the table above in Render's **Environment** tab.

### 3. Verify

Once deployed, check the health endpoint:

```
GET https://your-backend.onrender.com/health
```

### 4. Connect Frontend

After deploying the frontend, update `CLIENT_URL` to include the frontend's Vercel domain so CORS and Socket.IO allow the connection.

---

## 🗄️ Database Models

| Model | Description |
| :--- | :--- |
| `User` | User profile, hashed password, avatar, online status |
| `Message` | Direct messages (text, image, voice) between two users |
| `Call` | Audio/video call logs with duration & status |
| `Community` | Community name, description, icon, owner, members |
| `CommunityRoom` | Chat rooms within a community |
| `CommunityMessage` | Messages posted in community rooms |
| `CommunityInvitation` | Pending community join invitations |
| `FriendRequest` | Friend request with pending/accepted/rejected status |
| `Game` | Active/completed game state (Chess, Connect-4, Tic-Tac-Toe) |
| `GameScore` | Aggregated win/loss/draw statistics per player |
| `Memory` | Personal memories with images and captions |
| `Story` | 24-hour ephemeral stories with auto-expiry |
| `OTP` | Email verification OTP tokens with TTL |

---

## 🛡️ Security Features

- **JWT HttpOnly Cookies** — Tokens are stored in secure, httpOnly cookies (not localStorage)
- **BcryptJS** — Passwords are salted and hashed before storage
- **Arcjet** — Bot detection and protection at the API gateway level
- **Rate Limiting** — `express-rate-limit` prevents brute-force and abuse
- **CORS Whitelist** — Only `CLIENT_URL` origins are allowed
- **Socket Authentication** — Every Socket.IO connection is verified via JWT middleware
- **Environment Isolation** — All secrets are in `.env`, never hardcoded

---

## 🔧 Troubleshooting

### MongoDB Connection Timeout / DNS Error
- In MongoDB Atlas → **Network Access**, add `0.0.0.0/0` to allow cloud servers (Render/Railway) to connect.
- Ensure your connection string includes the database name: `mongodb+srv://.../VibeVerse?retryWrites=true&w=majority`.

### Brevo Email Sending Fails
- Verify your API key starts with `xkeysib-` and is correctly set in `BREVO_API_KEY`.
- Ensure `EMAIL_FROM` matches a **verified sender** email in your Brevo dashboard.

### Cross-Domain Cookies Not Stored
- Set `COOKIE_SAME_SITE=none` and `NODE_ENV=production` so cookies use `Secure=true`.
- Ensure `CLIENT_URL` matches the frontend domain exactly (no trailing slash).

### Socket.IO Connection Refused
- Verify `CLIENT_URL` in the backend includes the frontend's deployed domain.
- Ensure the deployment platform supports persistent WebSocket connections (not serverless).

---

## 📄 License

This project is open-source under the [ISC License](../LICENSE).
