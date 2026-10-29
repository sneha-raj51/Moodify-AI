# Moodify AI — AI Music Recommendation & Mood Transition Platform

Moodify AI is a full-stack, multimodal music curation and mood-transition application. It bridges real-time facial expression awareness with a modular Python recommendation engine, external music provider integrations (Apple Music / iTunes 30-second previews and Jamendo royalty-free streams), and MongoDB personalization.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                   React + Vite Client                  │
│  (MoodStudio, Discover, MoodTransition, Player, Stats) │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / REST
                            ▼
┌────────────────────────────────────────────────────────┐
│                 Node.js + Express API                  │
│       (Auth, Catalog, Favorites, History, Proxy)       │
└─────────────┬──────────────────────────────┬───────────┘
              │                              │
              ▼                              ▼
┌───────────────────────────┐  ┌─────────────────────────┐
│     MongoDB Database      │  │   Python FastAPI Engine │
│  (Songs, Users, History,  │  │  (Multi-feature Ranking,│
│        Favorites)         │  │   Mood Transitions, FER)│
└───────────────────────────┘  └─────────────────────────┘
              ▲
              │ (External Previews & Streams)
┌─────────────┴─────────────┐
│ Apple Music / iTunes API  │
│      & Jamendo API        │
└───────────────────────────┘
```

---

## Technology Stack

- **Frontend**: React 18, Vite, Lucide Icons, MediaPipe Face Detection.
- **Backend Gateway**: Node.js, Express (ES Modules), Mongoose, JWT, bcryptjs.
- **Database**: MongoDB (Local or MongoDB Atlas).
- **Python ML & Recommendation Service**: Python 3.13+, FastAPI, Uvicorn, Pydantic v2, PyTorch, Torchvision, OpenCV.
- **Music Providers**:
  - **iTunes / Apple Music Search API**: Authentic 30-second audio stream previews in English, Hindi, and Punjabi (no API key required).
  - **Jamendo API**: Royalty-free full audio streams matching mood tags (optional client ID).
  - **MongoDB Native Catalog**: Curated tracks with mood tags, genres, and language metadata.

---

## Demonstration Status & Feature Verification

| Feature | Implementation Status | Verification Performed | Remaining Blockers / Notes |
| :--- | :--- | :--- | :--- |
| **Python Recommendation Engine** | **Operational** | Tested with 14 automated unit tests & live REST calls. Correctly weights mood (+3.0), genre (+2.0), language (+2.5), artist preference (+1.2), and history/skip penalties ($-5.0$). | None. Fully functional and deterministic. |
| **Mood Transition Engine** | **Operational** | Tested via `POST /api/ai/recommend/transition`. Sequentially transitions across stages (e.g., Sad $\rightarrow$ Neutral $\rightarrow$ Happy). | None. |
| **Express-to-FastAPI Proxy** | **Operational** | Tested with Vitest integration suite and live requests. Auto-fallbacks to rule-based ranking if Python is unreachable. | None. |
| **Multilingual Catalog** | **Operational** | Tested with Hindi, Punjabi, and English filters. Correctly identifies language without guessing unknown tracks. | None. |
| **Audio Playback Controls** | **Operational** | Play/pause, track seeking, volume control, next/previous track navigation, preview badges, and missing audio fallback indicators. | Browser autoplay policies require initial user gesture. |
| **Favorites & History** | **Operational** | Full MongoDB persistence for local MongoDB IDs and external iTunes/Jamendo string IDs. | None. |
| **Facial Emotion Recognition** | **Fallback Active** | OpenCV Haar cascade & PyTorch ResNet18 pipeline implemented. Service returns HTTP 503 (`model_not_ready`) when weights are missing. | **FER2013 weights not included by default.** User selects mood manually. |
| **Camera Privacy** | **Verified** | MediaPipe face presence runs in client memory; video frames are never saved or sent to external servers. | Requires HTTPS or `localhost` context. |

---

## Python Recommendation Scoring Formula

The Python recommendation engine (`ml-service/recommender.py`) calculates a deterministic composite score for each catalog candidate $S$:

$$\text{Score}(S) = S_{\text{mood}} + S_{\text{genre}} + S_{\text{language}} + S_{\text{artist}} + S_{\text{favorite}} - P_{\text{recent}} - P_{\text{skip}}$$

1. **Mood Relevance ($S_{\text{mood}}$, up to $+3.0$)**: Direct match with confirmed mood ($+3.0$); secondary mood tag overlap ($+1.5$ to $+2.25$).
2. **Genre Preference ($S_{\text{genre}}$, $+2.0$)**: Awarded if the candidate matches user favorited genres.
3. **Language Preference ($S_{\text{language}}$, up to $+2.5$)**: $+2.5$ for exact match with preferred language (**Hindi**, **Punjabi**, **English**). Unknown language is $0.0$ (never guessed or penalized). Mild $-1.0$ penalty if user explicitly filters for a specific language and track is explicitly another language.
4. **Artist Preference ($S_{\text{artist}}$, $+1.2$)**: Awarded if the artist matches user's saved favorite artists.
5. **Saved Favorite Bonus ($S_{\text{favorite}}$, $+1.5$)**: Awarded if the candidate is already favorited.
6. **Recency Penalty ($P_{\text{recent}}$, $-2.0$)**: Penalizes recently played songs to promote catalog exploration; completed tracks receive $+0.8$ familiarity offset.
7. **Skip Penalty ($P_{\text{skip}}$, $-5.0$)**: Heavily penalizes tracks skipped by user in listening history.
8. **Cold Start**: Baseline score $+0.1$ when user has zero history.
9. **Deduplication**: Strict deduplication by unique ID and normalized `(title, artist)` pair.

---

## Windows PowerShell Setup Instructions

### 1. Python ML & Recommendation Service
```powershell
cd "ml-service"
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Express Backend
```powershell
cd "backend"
npm install
Copy-Item .env.example .env
# Edit .env with your MONGODB_URI and JWT_SECRET if using custom database
node src/scripts/seed.js
```

### 3. React Frontend
```powershell
cd "frontend"
npm install
```

---

## Service Startup Commands

To run the complete application for a demonstration, open **three Windows PowerShell terminals**:

### Terminal 1: Python ML Service (Port 8000)
```powershell
cd "ml-service"
.\venv\Scripts\activate
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
*Health Check: Open [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health) in your browser.*

### Terminal 2: Express Backend (Port 5000)
```powershell
cd "backend"
npm run dev
```
*Health Check: Open [http://127.0.0.1:5000/api/health](http://127.0.0.1:5000/api/health) in your browser.*

### Terminal 3: React Frontend (Port 5173)
```powershell
cd "frontend"
npm run dev
```
*Application UI: Open [http://localhost:5173](http://localhost:5173) in your browser.*

---

## Automated Test Execution

### 1. Python ML Service Tests
```powershell
cd "ml-service"
.\venv\Scripts\pytest
```
*Executes 14 unit tests validating ranking formulas, language weighting, history penalties, transitions, and cold start.*

### 2. Backend Integration Tests
```powershell
cd "backend"
npm test
```
*Executes 19 Vitest integration tests against in-memory MongoDB verifying auth, Express-to-FastAPI proxy, and rule-based fallback.*

### 3. Frontend Production Build
```powershell
cd "frontend"
npm run build
```
*Validates that all JSX, CSS, and component imports compile into production bundles without errors.*

---

## Environment Variables

### Backend (`backend/.env`)
| Variable | Description | Required | Default |
| :--- | :--- | :--- | :--- |
| `PORT` | HTTP port for Express | No | `5000` |
| `MONGODB_URI` | MongoDB connection string (local or Atlas) | Yes | `mongodb://127.0.0.1:27017/moodify` |
| `ML_SERVICE_URL` | Base URL of Python FastAPI service | Yes | `http://127.0.0.1:8000` |
| `JWT_SECRET` | Secret key for signing authentication tokens | Yes | - |
| `JAMENDO_CLIENT_ID` | Optional client ID for Jamendo streaming API | No | - |
| `CORS_ORIGIN` | Allowed client origin | No | `http://localhost:5173` |

### Frontend (`frontend/.env`)
| Variable | Description | Required | Default |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Express backend API endpoint | Yes | `http://localhost:5000/api` |

---

## Facial Emotion Model Training (Optional Setup)

The PyTorch training pipeline is fully implemented in `ml-service/train.py`. If you wish to train local emotion weights:

1. **Download Dataset**: Download `fer2013.csv` from the [Kaggle FER2013 Challenge](https://www.kaggle.com/c/challenges-in-representation-learning-facial-expression-recognition-challenge/data).
2. **Place File**: Save as `ml-service/data/fer2013.csv`.
3. **Execute Training**:
   ```powershell
   cd "ml-service"
   .\venv\Scripts\activate
   python train.py --epochs 10 --batch-size 32
   ```
4. **Result**: Artifacts are saved to `ml-service/models/fer2013_resnet18.pth` and `models/fer2013_resnet18_metadata.json`. Upon restarting FastAPI, `/health` will report `"model_ready": true`.

---

## Privacy and Ethics Notice

1. **Camera Privacy**: All video frame handling occurs locally in browser memory using MediaPipe. No webcam frames or biometric recordings are stored on disk or transmitted to any external server.
2. **Affective Computing Limitations**: Facial expressions do not equate directly to internal emotional states. Moodify AI treats expression estimations strictly as subjective recommendations and encourages manual mood confirmation.
3. **Audio Licensing**: Audio previews from iTunes and Jamendo are served via legitimate public API endpoints and preview audio format restrictions are respected.
