# Moodify AI — AI-Powered Music Recommendation & Mood Transition Platform

Moodify AI is a full-stack, multimodal music curation and mood-transition web application. It integrates visible facial expression classification and manual mood selection with a deterministic Python recommendation ranking engine, an empathetic AI Music Companion (powered by Groq with deterministic multilingual fallback), external legal audio streaming providers (Apple Music / iTunes 30-second previews, Audius decentralized streaming, and Jamendo royalty-free music), and personalized MongoDB listening history, favorites, and analytics.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                          React + Vite Client                           │
│  (MoodStudio, Discover, MoodTransition, MoodMix, CompanionChat, Player)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ REST API / JWT
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Node.js + Express API                          │
│   (Auth, Catalog, Favorites, History, Playlists, Proxy, AI Companion)  │
└──────────────┬──────────────────────────────┬──────────────────────────┘
               │                              │
               ▼                              ▼
┌───────────────────────────┐  ┌─────────────────────────────────────────┐
│     MongoDB Database      │  │        Python FastAPI ML Service        │
│  (Songs, Users, History,  │  │  (Multi-feature Ranking, Transitions,   │
│  Favorites, ChatSessions) │  │   Facial Expression Classification)     │
└───────────────────────────┘  └─────────────────────────────────────────┘
               │
               ▼ (External Streaming & Previews)
┌────────────────────────────────────────────────────────────────────────┐
│  • Apple Music / iTunes Search API (Legal 30-sec previews, zero key)   │
│  • Audius Protocol (Decentralized legal full-length streaming)          │
│  • Jamendo API (Creative Commons independent tracks)                   │
│  • Groq Cloud API (Llama 3 / Mixtral / OSS LLMs for Music Companion)   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Key Features

1. **Facial Expression Awareness & Mood Detection**:
   - Detects visible facial expressions using client-side MediaPipe face detection and local PyTorch ResNet-18 classification.
   - Respects user privacy: video streams remain ephemeral in browser memory and are never persisted or shared.
   - Always provides manual mood selection (Happy, Sad, Calm, Energetic, Romantic, Angry, Fear, Neutral).
2. **Context-Aware AI Music Companion**:
   - Natural conversation interface supporting English, Hindi, and Hinglish.
   - Powered by Groq (`openai/gpt-oss-20b`) with sensible timeouts and automatic fallback to a deterministic multilingual rule engine if external services are unreachable.
   - Refines recommendations based on ongoing conversational context (e.g. "suggest something calmer", "keep this vibe").
3. **Deterministic Multi-Feature Recommendation Engine**:
   - High-performance Python FastAPI service ranking catalog tracks using composite scoring (mood relevance, genre matching, language affinity, artist familiarity, recency penalties, and skip avoidance).
4. **Adaptive Mood Transitions**:
   - Multi-step emotional journeys smoothly guiding listeners from their starting emotional state to an intended target mood (e.g. Sad $\rightarrow$ Calm $\rightarrow$ Uplifting $\rightarrow$ Happy).
5. **Smart Playlist Builder**:
   - Builds custom sets tailored by duration, vocal preference, mood, genre, and energy, deduplicating prior plays.
6. **Library, Favorites, and Listening History**:
   - Full persistence in MongoDB Atlas for local catalogue tracks and external streaming songs.
   - Normalizes track IDs across catalog ObjectIds and provider IDs (e.g. `itunes_...`).
   - Distinguishes naturally completed tracks from early skips and tracks meaningful listening sessions ($\ge 15\text{s}$).
7. **Listening Recap & Mood Journal**:
   - Aggregates listening statistics (total plays, completion rates, top artists, top genres) across custom and all-time date ranges.

---

## Technology Stack

- **Frontend**: React 19, Vite 8, Tailwind CSS, Lucide Icons, MediaPipe Vision.
- **Backend**: Node.js 22, Express 5, Mongoose 9, JWT Authentication, express-rate-limit.
- **Database**: MongoDB Atlas / MongoDB 7+.
- **Machine Learning**: Python 3.13, FastAPI, PyTorch, Torchvision, OpenCV, Pydantic v2.
- **AI Companion**: Groq API (Primary), OpenAI & Google Gemini (Configurable Fallbacks), Multilingual Rule Engine (Deterministic Offline Fallback).
- **Audio Providers**:
  - **Apple Music / iTunes API**: Verified 30-second audio stream previews across global and Indian catalogs (no API key required).
  - **Audius Protocol**: Decentralized full-length independent streaming.
  - **Jamendo API**: Creative Commons independent music streams.

---

## Repository Structure

```
Moodify-AI/
├── backend/
│   ├── src/
│   │   ├── config/         # Database and server configuration
│   │   ├── controllers/    # Route controllers (auth, favorites, history, playlists, chat)
│   │   ├── middleware/     # JWT authentication, rate limiting, validation
│   │   ├── models/         # Mongoose schemas (User, Song, History, Favorite, ChatSession)
│   │   ├── routes/         # Express API route declarations
│   │   ├── scripts/        # Database seed and maintenance utilities
│   │   ├── services/       # Music providers, AI companion, smart playlist builder
│   │   └── server.js       # Production server entry point
│   ├── tests/              # 18 Vitest test suites (193 automated tests)
│   ├── .env.example        # Environment variable template with placeholders
│   └── package.json
├── frontend/
│   ├── public/             # Static assets, icons, and face detection model manifest
│   ├── src/
│   │   ├── assets/         # App imagery and illustrations
│   │   ├── components/     # UI components (Player, Sidebar, Header, Modals)
│   │   ├── hooks/          # Custom React hooks (useFaceDetector)
│   │   ├── pages/          # Application views (Discover, MoodStudio, MoodMix, History)
│   │   ├── services/       # Frontend API client and local guest storage
│   │   └── utils/          # Decision engines and mock data
│   ├── .env.example        # Frontend environment variable template
│   └── package.json
├── ml-service/
│   ├── models/             # Architecture metadata and evaluation reports
│   ├── main.py             # FastAPI entry point & inference endpoints
│   ├── recommender.py      # Deterministic recommendation scoring engine
│   ├── test_main.py        # 27 Pytest automated test suites
│   ├── requirements.txt    # Python dependencies
│   └── .env.example        # ML service environment variable template
├── .gitignore              # Repository-wide Git ignore rules
└── README.md               # Project documentation
```

---

## Local Setup Instructions

### Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended).
- **Python**: v3.10 to v3.13.
- **MongoDB**: Active MongoDB Atlas cluster URI or local MongoDB instance (`mongodb://127.0.0.1:27017/moodify`).

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/sneha-raj51/Moodify-AI.git
cd Moodify-AI
```

---

### Step 2: Configure & Run the ML Service
```bash
cd ml-service
python -m venv venv

# Windows PowerShell:
.\venv\Scripts\activate
# Linux/macOS:
# source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env

# Start ML service on port 8000
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
*Health Check: Verify at `http://127.0.0.1:8000/health` (should return `{"status":"ok"}`).*

---

### Step 3: Configure & Run the Express Backend
Open a new terminal:
```bash
cd backend
npm install
cp .env.example .env
# Edit .env to set your MONGODB_URI, JWT_SECRET, and GROQ_API_KEY

# Optional: seed initial database catalog
npm run seed

# Start backend dev server on port 5000
npm run dev
```
*Health Check: Verify at `http://localhost:5000/api/health`.*

---

### Step 4: Configure & Run the React Frontend
Open a third terminal:
```bash
cd frontend
npm install
cp .env.example .env

# Start Vite dev server on port 5173
npm run dev
```
*Access the application in your browser at `http://localhost:5173`.*

---

## Environment Variables Reference

### Backend (`backend/.env`)
| Variable | Description | Required | Default / Example |
| :--- | :--- | :--- | :--- |
| `PORT` | HTTP port for Express | No | `5000` |
| `NODE_ENV` | Application environment (`development` / `production`) | No | `development` |
| `MONGODB_URI` | MongoDB Atlas or local connection string | **Yes** | `mongodb://127.0.0.1:27017/moodify` |
| `JWT_SECRET` | Secret key used to sign authentication tokens | **Yes** | `your_secure_random_jwt_secret` |
| `JWT_EXPIRES_IN` | Token validity duration | No | `7d` |
| `CORS_ORIGIN` | Allowed client origin(s), comma-separated | No | `http://localhost:5173` |
| `ML_SERVICE_URL` | Base URL of the Python FastAPI service | **Yes** | `http://127.0.0.1:8000` |
| `AI_PROVIDER` | Preferred AI companion provider (`groq`, `openai`, `gemini`) | No | `groq` |
| `GROQ_API_KEY` | Groq Cloud API key for companion chat | Optional | `gsk_...` |
| `GROQ_MODEL` | Groq LLM model name | No | `openai/gpt-oss-20b` |
| `AI_FALLBACK_PROVIDERS` | Comma-separated list of secondary providers | No | `openai,gemini` |
| `OPENAI_API_KEY` | Optional OpenAI key for secondary fallback | Optional | `sk-...` |
| `GEMINI_API_KEY` | Optional Google Gemini key for secondary fallback | Optional | `AIza...` |
| `AUDIUS_APP_NAME` | Audius protocol app identifier | No | `MoodifyAI` |
| `JAMENDO_CLIENT_ID` | Optional client ID for Jamendo streaming API | Optional | - |
| `RESEND_API_KEY` | Optional Resend API key for password reset emails | Optional | - |

### Frontend (`frontend/.env`)
| Variable | Description | Required | Default / Example |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Express backend API endpoint | **Yes** | `http://localhost:5000/api` |

### ML Service (`ml-service/.env`)
| Variable | Description | Required | Default / Example |
| :--- | :--- | :--- | :--- |
| `PORT` | Port for FastAPI service | No | `8000` |
| `MODEL_PATH` | Path to trained ResNet-18 checkpoint | No | `models/fer2013_resnet18.pth` |
| `CONFIDENCE_THRESHOLD` | Minimum confidence score to accept inference | No | `0.50` |
| `CORS_ORIGINS` | Allowed origins for ML service | No | `*` |

---

## Automated Test Execution

All test suites can be executed independently:

### 1. Backend Vitest Integration Tests (18 files, 193 tests)
```bash
cd backend
npm test -- --run
```
*Validates user authentication, token isolation, rate limiting, playlist generation, smart recommendation proxying, iTunes preview lookup, history completion vs. skip tracking, and favorites deduplication.*

### 2. Python ML Service Pytest (27 unit & integration tests)
```bash
cd ml-service
# Activate your venv first
pytest -v
```
*Validates facial expression classification endpoints, request validation, composite scoring formulas, language weighting, history penalties, and transition generation.*

### 3. Frontend Code Quality & Production Build
```bash
cd frontend
# Run linter
npm run lint

# Validate production build bundle
npm run build
```

---

## Production Deployment Preparation

1. **Backend**:
   - The production start command is `node src/server.js` (defined in `backend/package.json`).
   - The server listens on `0.0.0.0` and respects `process.env.PORT`.
   - In production, stack traces are automatically excluded from API error responses.
2. **Frontend**:
   - Run `npm run build` to generate static assets in `frontend/dist/`.
   - Host static files using Vercel, Netlify, Cloudflare Pages, or Nginx.
   - Point `VITE_API_BASE_URL` to your production backend URL (e.g. `https://api.yourdomain.com/api`) or configure `/api` reverse-proxy rules.
3. **ML Service**:
   - Start using `uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2`.
   - Ensure the host has at least 1 GB RAM allocated for PyTorch model inference.
4. **Database**:
   - Whitelist your deployment server's IP address (or enable `0.0.0.0/0` with strong password authentication) in MongoDB Atlas Network Access.

---

## Ethical Considerations & Limitations

- **Affective Computing Scope**: Moodify AI classifies visible facial expressions and movements from video frames; it does **not** claim to read internal thoughts, mental health conditions, or true internal emotions. Users can always manually confirm or change their mood.
- **Audio Previews**: Tracks sourced from the Apple Music / iTunes API are genuine 30-second audio previews provided legally via Apple's public search API. Full-length streaming is available for Audius and Jamendo tracks, and local catalog items.
- **Privacy First**: Camera frames processed by MediaPipe are kept in browser memory and are never saved to disk or transmitted across the network.
