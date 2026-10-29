# Moodify AI - Python ML & Recommendation Service

This directory contains the Python FastAPI service for **Moodify AI**.
It serves two dedicated, decoupled components:
1. **Facial Emotion Estimation**: Local face detection and expression classification using OpenCV and PyTorch.
2. **Deterministic Recommendation Engine**: A modular multi-feature song scoring and ranking algorithm supporting mood matching, mood transitions, language filters (Hindi, Punjabi, English), genres, and listening history penalties.

---

## Important Notice on Emotion Model Weights
> [!IMPORTANT]
> **Trained FER2013 weights are currently NOT included in the repository by default.**
> When weights (`models/fer2013_resnet18.pth`) are missing, the service starts safely and reports `"model_ready": false`.
> The `/predict` endpoint returns HTTP 503 (`model_not_ready`).
> **The application will NEVER fabricate or silently invent facial emotion predictions.**
> Users can select and confirm their mood manually in the UI, and the recommendation engine operates at full capability.

---

## Python Recommendation Engine

### Architecture Overview
The recommendation engine (`recommender.py`) is decoupled from emotion inference. It is a deterministic, multi-feature ranking engine that scores catalog candidates provided by the backend.

### Scoring Formula
Each candidate song $S$ in the catalog receives a deterministic composite score:

$$\text{Score}(S) = S_{\text{mood}} + S_{\text{genre}} + S_{\text{language}} + S_{\text{artist}} + S_{\text{favorite}} - P_{\text{recent}} - P_{\text{skip}}$$

#### 1. Mood Relevance ($S_{\text{mood}}$, weight up to 3.0)
- **Direct Match**: $+3.0$ if the song's primary mood or tags match the target mood (e.g., Happy, Sad, Calm, Energetic, Neutral).
- **Secondary / Partial Tag Overlap**: $+1.5$ to $+2.25$.
- **Transition Bridging**: During mood transitions, tracks bridging the current mood and target mood receive blended relevance scores.

#### 2. Genre Preference ($S_{\text{genre}}$, weight up to 2.0)
- $+2.0$ if the song genre matches any of the user's preferred or favorited genres.

#### 3. Language Preference ($S_{\text{language}}$, weight up to 2.5)
- User can select preferred languages (e.g. **Hindi**, **Punjabi**, **English**).
- **Exact Match**: $+2.5$ bonus.
- **Unknown Language**: $0.0$ (neutral). Unknown languages are **never guessed or penalized**.
- **Explicit Mismatch**: $-1.0$ penalty if the user explicitly requested a specific language and the track is tagged with a different known language.

#### 4. Artist Preference ($S_{\text{artist}}$, weight up to 1.2)
- $+1.2$ if the track's artist matches an artist from the user's favorite tracks or explicit favorite artist list.

#### 5. Saved Favorite Bonus ($S_{\text{favorite}}$, weight up to 1.5)
- $+1.5$ if the song ID is in the user's saved favorite song IDs.

#### 6. Recency Penalty ($P_{\text{recent}}$, penalty up to 2.0)
- $-2.0$ if the track appears in the user's recent listening history (encourages discovery and avoids repetitive recommendations).
- If the track was completed without skip, a $+0.8$ familiarity bonus is awarded to balance discovery with favorite listening.

#### 7. Skip Penalty ($P_{\text{skip}}$, penalty up to 5.0)
- $-5.0$ penalty if the track was explicitly skipped in the user's recent history. Tracks with severe penalties ($< -3.0$) are pruned.

#### Cold-Start Handling:
- When a user has no listening history or favorites, all candidate tracks receive a neutral baseline score ($+0.1$), and recommendations are ranked purely by confirmed mood, explicit language, and genre preferences.

#### Deduplication & Determinism:
- Candidates are deduplicated by stable song ID and normalized `(title, artist)` pair.
- Sorting is strictly deterministic: descending by score, followed by alphabetical title as tie-breaker.

*Note: This algorithm is a documented, deterministic heuristic ranking formula. It is NOT a trained neural network or deep-learning model.*

---

## API Endpoints

### 1. `GET /health`
Returns service readiness and component status:
```json
{
  "status": "ok",
  "model_ready": false,
  "recommender_ready": true,
  "device": "cpu",
  "emotion_model_missing": true
}
```

### 2. `POST /predict`
- **Request**: Multipart form data with image file `file`.
- **Response**: `503 model_not_ready` if weights are absent, or emotion classification scores if weights are loaded.

### 3. `POST /recommend`
- **Request**:
```json
{
  "catalog": [
    {
      "id": "660011223344",
      "title": "Tum Hi Ho",
      "artist": "Arijit Singh",
      "genre": "Bollywood",
      "mood": "Sad",
      "language": "Hindi",
      "artwork": "https://example.com/art.jpg",
      "audio_url": "https://example.com/preview.mp3",
      "is_playable": true,
      "provider": "mongodb"
    }
  ],
  "preferences": {
    "current_mood": "Sad",
    "desired_mood": null,
    "preferred_languages": ["Hindi"],
    "favorite_genres": ["Bollywood"],
    "favorite_song_ids": [],
    "favorite_artists": ["Arijit Singh"],
    "recent_history": []
  },
  "limit": 10
}
```
- **Response**:
```json
[
  {
    "id": "660011223344",
    "title": "Tum Hi Ho",
    "artist": "Arijit Singh",
    "score": 6.7,
    "explanation": "Selected because it matches your Sad mood and matches preferred language (Hindi) and by favorite artist Arijit Singh.",
    "is_playable": true,
    "language": "Hindi",
    "genre": "Bollywood",
    "mood": "Sad",
    "provider": "mongodb"
  }
]
```

### 4. `POST /recommend/transition`
- **Request**:
```json
{
  "catalog": [...],
  "start_mood": "Sad",
  "desired_mood": "Happy",
  "steps_count": 3,
  "limit_per_step": 2
}
```
- **Response**: List of sequential `TransitionStep` objects showing the progression from `start_mood` to `desired_mood` with ranked tracks for each stage.

---

## Setup & Running the Tests

1. Activate virtual environment:
   ```powershell
   cd ml-service
   .\venv\Scripts\activate
   ```
2. Run automated test suite:
   ```powershell
   pytest
   ```
3. Run the FastAPI development server:
   ```powershell
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```
