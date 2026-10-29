"""
Moodify AI - Python Recommendation Engine
==========================================

This module implements a deterministic, multi-feature scoring and ranking algorithm
for music recommendations based on mood, user preferences, listening history,
and explicit feedback (likes, skips).

DISCLAIMER:
This recommendation engine uses a documented, transparent weighted heuristic formula.
It is NOT a trained neural network or deep-learning ranking model. It is kept completely
separate from the facial expression classification computer vision models.

SCORING FORMULA:
----------------
For each candidate song S in the catalog, its raw composite score is computed as:

    Score(S) = S_mood + S_genre + S_language + S_artist + S_favorite - P_recent - P_skip

Where:
1. Mood Relevance (S_mood, weight up to 3.5):
   - Direct match with target mood: +3.0
   - Multi-mood tag match: +3.0 (or partial tag overlap +1.5)
   - Transition mode: If transitioning from mood A to mood B at step t in [0, 1]:
       S_mood = 3.0 * ((1 - t) * match(S, A) + t * match(S, B))

2. Genre Preference (S_genre, weight up to 2.0):
   - If song genre matches one of user's favorite genres: +2.0

3. Language Preference (S_language, weight up to 2.5):
   - If user specified preferred languages (e.g. Hindi, Punjabi, English):
     * Exact match with preferred language: +2.5
     * Unknown language (None/null): 0.0 (never penalized or fabricated)
     * Different known language: -1.0 (mild mismatch penalty if user explicitly asked for specific language)

4. Artist Preference (S_artist, weight up to 1.5):
   - If song artist matches any artist from user's favorite songs or favorite artists: +1.5

5. Favorite Bonus (S_favorite, weight up to 1.5):
   - If song ID is directly in user's favorite song IDs: +1.5

6. Recency Penalty (P_recent, penalty up to 2.0):
   - If song was played in recent history: -2.0 (encourages catalog discovery)

7. Feedback / Skip Penalty (P_skip, penalty up to 5.0):
   - If song was skipped by user in listening history: -5.0
   - If song was marked completed / meaningful listen: +1.0 (positive engagement bonus)

8. Playability Consideration:
   - If is_playable is True, track is flagged as playable. Metadata-only tracks are kept,
     not discarded, but playability status is strictly preserved.

Normalization & Deduplication:
- Candidate scores are calculated deterministically.
- Tracks with severe negative scores (e.g., repeatedly skipped tracks < -3.0) are filtered out.
- Deduplication is performed by stable song ID as well as normalized (title, artist) pair.
- Results are sorted descending by Score, then alphabetically by title as deterministic tie-breaker.
- If catalog is sparse, all valid candidates are returned without fabricating tracks or audio URLs.
"""

from typing import List, Optional, Dict, Any, Tuple
from pydantic import BaseModel, Field
import re


class SongCandidate(BaseModel):
    id: str = Field(..., description="Stable song identifier")
    title: str = Field(..., description="Song title")
    artist: str = Field(..., description="Song artist")
    genre: Optional[str] = Field(None, description="Genre tag if available")
    mood: Optional[str] = Field(None, description="Primary mood tag")
    moods: Optional[List[str]] = Field(default_factory=list, description="All associated mood tags")
    language: Optional[str] = Field(None, description="Known language: Hindi, Punjabi, English, etc. None if unknown.")
    artwork: Optional[str] = Field(None, description="Cover art or album artwork URL")
    audio_url: Optional[str] = Field(None, description="Audio playback/preview stream URL")
    is_playable: bool = Field(False, description="True if audio preview or stream is available")
    provider: str = Field("mongodb", description="Source provider: mongodb, jamendo, itunes, etc.")
    external_id: Optional[str] = Field(None, description="Original external provider ID if applicable")


class HistoryItem(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    skipped: bool = False
    completed: bool = False
    listened_duration: float = 0.0
    timestamp: Optional[str] = None


class UserPreferences(BaseModel):
    current_mood: str = Field(..., description="User-confirmed current mood (e.g., Happy, Sad, Calm, Energetic, Neutral)")
    desired_mood: Optional[str] = Field(None, description="Optional target mood for mood transitions")
    preferred_languages: List[str] = Field(default_factory=list, description="Preferred languages: e.g. ['Hindi', 'Punjabi', 'English']")
    favorite_genres: List[str] = Field(default_factory=list, description="User favorite genres")
    favorite_song_ids: List[str] = Field(default_factory=list, description="IDs of songs user favorited")
    favorite_artists: List[str] = Field(default_factory=list, description="Names of user favorite artists")
    recent_history: List[HistoryItem] = Field(default_factory=list, description="Listening history records")
    listening_mode: Optional[str] = Field(None, description="Smart listening mode: Study, Relax, Sleep, Workout, Travel, Chill")
    energy_level: Optional[str] = Field(None, description="User preferred energy level: calm, balanced, energetic, low, medium, high")
    feedback_likes: List[str] = Field(default_factory=list, description="Song IDs user explicitly liked")
    feedback_dislikes: List[str] = Field(default_factory=list, description="Song IDs user explicitly disliked")


class RecommendRequest(BaseModel):
    catalog: List[SongCandidate] = Field(..., description="Available song catalog candidates")
    preferences: UserPreferences = Field(..., description="User mood and listening preferences")
    limit: int = Field(20, ge=1, le=100, description="Maximum number of songs to recommend")


class RecommendationResult(BaseModel):
    id: str
    title: str
    artist: str
    score: float
    explanation: str
    reasons: List[str] = Field(default_factory=list, description="Detailed list of active contributing factors")
    scoring_factors: Dict[str, float] = Field(default_factory=dict, description="Numerical contribution of each factor")
    is_playable: bool
    language: Optional[str] = None
    genre: Optional[str] = None
    mood: Optional[str] = None
    provider: str


class TransitionStep(BaseModel):
    step_index: int
    target_mood: str
    interpolated_progress: float
    recommended_songs: List[RecommendationResult]


class TransitionRecommendRequest(BaseModel):
    catalog: List[SongCandidate]
    start_mood: str
    desired_mood: str
    steps_count: int = Field(3, ge=2, le=5)
    preferences: Optional[UserPreferences] = None
    limit_per_step: int = Field(2, ge=1, le=10)


def normalize_string(val: Optional[str]) -> str:
    if not val:
        return ""
    return re.sub(r"\s+", " ", val.strip().lower())


def matches_mood(song_mood: Optional[str], song_moods: Optional[List[str]], target_mood: str) -> float:
    """Returns 1.0 for direct match, 0.75 for partial/secondary match, 0.0 otherwise."""
    if not target_mood:
        return 0.0
    t = target_mood.strip().lower()
    
    if song_mood and song_mood.strip().lower() == t:
        return 1.0
        
    if song_moods:
        lower_moods = [m.strip().lower() for m in song_moods if m]
        if t in lower_moods:
            return 1.0
        for m in lower_moods:
            if t in m or m in t:
                return 0.75

    if song_mood and (t in song_mood.lower() or song_mood.lower() in t):
        return 0.75
        
    return 0.0


def evaluate_listening_mode(song: SongCandidate, mode: Optional[str]) -> Tuple[float, Optional[str]]:
    """
    Applies genuine, documented ranking rules based on available song metadata.
    Does NOT invent BPM or fake energy values. Uses genre, mood tags, and fallback.
    """
    if not mode:
        return 0.0, None

    m = mode.strip().lower()
    genre = (song.genre or "").lower()
    mood = (song.mood or "").lower()
    moods = [sm.lower() for sm in (song.moods or [])]

    # Study: Calm, focus-friendly, instrumental, acoustic, ambient
    if m == "study":
        focus_genres = ["classical", "ambient", "acoustic", "instrumental", "lo-fi", "chill", "piano"]
        distracting_genres = ["metal", "hard rock", "dance", "electronic", "club", "party"]
        if any(fg in genre for fg in focus_genres) or mood in ["calm"] or any(x in moods for x in ["calm"]):
            return 2.5, "Curated for Study mode: focus-friendly and calming"
        if any(dg in genre for dg in distracting_genres) or mood in ["energetic"]:
            return -2.0, None
        return 0.5, "Study mode fallback: gentle pacing"

    # Relax: Calming, serene, low-intensity
    elif m == "relax":
        relax_genres = ["ambient", "acoustic", "lo-fi", "chill", "soul", "classical", "folk"]
        high_genres = ["metal", "techno", "rock", "hardcore"]
        if any(rg in genre for rg in relax_genres) or mood in ["calm", "sad", "neutral"] or any(x in moods for x in ["calm"]):
            return 3.0, "Curated for Relax mode: soothing and peaceful"
        if any(hg in genre for hg in high_genres):
            return -2.0, None
        return 0.5, "Relax mode fallback: smooth listening"

    # Sleep: Deep calm, peaceful soundscapes, soft piano, minimal dynamics
    elif m == "sleep":
        deep_sleep_genres = ["ambient", "sleep", "meditation", "lullaby", "nature", "white noise"]
        soft_genres = ["classical", "instrumental", "acoustic", "piano"]
        active_genres = ["rock", "pop", "dance", "hip-hop", "rap", "metal", "electronic"]
        if any(sg in genre for sg in deep_sleep_genres):
            return 4.0, "Curated for Sleep mode: tranquil soundscape"
        if any(sg in genre for sg in soft_genres) or mood in ["calm"] or any(x in moods for x in ["calm"]):
            return 3.0, "Curated for Sleep mode: gentle background melody"
        if any(ag in genre for ag in active_genres) or mood in ["energetic", "happy"]:
            return -4.0, None
        return 0.0, None

    # Workout: High-tempo, motivating, upbeat, energetic
    elif m == "workout":
        workout_genres = ["rock", "dance", "electronic", "hip-hop", "pop", "workout", "fitness", "metal", "edm"]
        if any(wg in genre for wg in workout_genres) or mood in ["energetic", "happy"] or any(x in moods for x in ["energetic"]):
            return 3.5, "Curated for Workout mode: energetic and motivating"
        if mood in ["sad", "calm"] and not any(wg in genre for wg in workout_genres):
            return -2.5, None
        return 0.5, "Workout mode: motivating selection"

    # Travel: Upbeat, exploration, multi-genre variety
    elif m == "travel":
        travel_genres = ["pop", "indie", "rock", "folk", "world", "adventure", "acoustic"]
        if any(tg in genre for tg in travel_genres) or mood in ["happy", "energetic", "calm"]:
            return 2.0, "Curated for Travel mode: dynamic journey soundtrack"
        return 0.5, "Travel mode fallback: discovery track"

    # Chill: Relaxed vibes, lo-fi, indie, R&B, mellow pop
    elif m == "chill":
        chill_genres = ["chill", "lo-fi", "indie", "r&b", "soul", "acoustic", "pop"]
        if any(cg in genre for cg in chill_genres) or mood in ["calm", "happy", "neutral"]:
            return 2.5, "Curated for Chill mode: relaxed, easygoing groove"
        return 0.5, "Chill mode: laid-back selection"

    return 0.0, None


def score_song(
    song: SongCandidate,
    prefs: UserPreferences,
    transition_target_mood: Optional[str] = None
) -> Tuple[float, str, List[str], Dict[str, float]]:
    score = 0.0
    reasons = []
    scoring_factors = {}

    target_mood = transition_target_mood or prefs.desired_mood or prefs.current_mood
    
    # 1. Mood relevance (Weight: up to 3.0)
    mood_match_factor = matches_mood(song.mood, song.moods, target_mood)
    if mood_match_factor > 0:
        mood_pts = round(3.0 * mood_match_factor, 2)
        score += mood_pts
        scoring_factors["mood_compatibility"] = mood_pts
        reasons.append(f"matches your {target_mood} mood")
    elif prefs.desired_mood and prefs.desired_mood != prefs.current_mood:
        # Check transition source mood for smooth bridging
        curr_factor = matches_mood(song.mood, song.moods, prefs.current_mood)
        if curr_factor > 0:
            bridge_pts = round(1.5 * curr_factor, 2)
            score += bridge_pts
            scoring_factors["transition_bridge"] = bridge_pts
            reasons.append(f"bridges from your current {prefs.current_mood} mood")

    # 2. Genre preference (Weight: 2.0)
    if song.genre and prefs.favorite_genres:
        s_genre = song.genre.lower()
        if any(g.lower() in s_genre or s_genre in g.lower() for g in prefs.favorite_genres):
            score += 2.0
            scoring_factors["genre_preference"] = 2.0
            reasons.append(f"matches your genre preference ({song.genre})")

    # 3. Language preference (Weight: +2.5 match, -1.0 explicit mismatch, 0.0 unknown)
    if prefs.preferred_languages:
        if song.language:
            s_lang = song.language.lower()
            if any(l.lower() == s_lang for l in prefs.preferred_languages):
                score += 2.5
                scoring_factors["language_preference"] = 2.5
                reasons.append(f"matches preferred language ({song.language})")
            else:
                score -= 1.0  # mild penalty if user requested specific language and track is explicitly another language
                scoring_factors["language_mismatch"] = -1.0
        else:
            # Unknown language is NOT guessed and NOT penalized
            pass

    # 4. Favorite song bonus (Weight: 1.5)
    if song.id in prefs.favorite_song_ids:
        score += 1.5
        scoring_factors["favorite_bonus"] = 1.5
        reasons.append("from your saved favorites")

    # 5. Favorite artist bonus (Weight: 1.2)
    s_artist = normalize_string(song.artist)
    if prefs.favorite_artists and s_artist:
        if any(normalize_string(fav_a) == s_artist for fav_a in prefs.favorite_artists):
            score += 1.2
            scoring_factors["artist_affinity"] = 1.2
            reasons.append(f"by favorite artist {song.artist}")

    # 6. Explicit Feedback Signals (Weight: +2.0 like, -10.0 dislike)
    if prefs.feedback_likes and song.id in prefs.feedback_likes:
        score += 2.0
        scoring_factors["feedback_positive"] = 2.0
        reasons.append("positively rated in your feedback")

    if prefs.feedback_dislikes and song.id in prefs.feedback_dislikes:
        score -= 10.0
        scoring_factors["feedback_negative"] = -10.0
        reasons.append("deprioritized due to negative feedback")

    # 7. History & Feedback Penalties
    recent_entries = [
        h for h in prefs.recent_history
        if (h.id and h.id == song.id) or (h.title and normalize_string(h.title) == normalize_string(song.title))
    ]
    if recent_entries:
        # Check skips first
        skips = [h for h in recent_entries if h.skipped]
        if skips:
            score -= 5.0
            scoring_factors["skip_penalty"] = -5.0
            reasons.append("penalized due to past skip feedback")
        else:
            # Not skipped, but recently played - mild recency penalty to encourage variety
            score -= 2.0
            scoring_factors["recency_penalty"] = -2.0
            reasons.append("recommended with variety in mind because you recently played similar tracks")
            # If completed, offset slightly for positive engagement
            if any(h.completed for h in recent_entries):
                score += 0.8
                scoring_factors["familiarity_bonus"] = 0.8
                reasons.append("familiar favorite")

    # 8. Smart Listening Mode Evaluation
    if prefs.listening_mode:
        mode_score, mode_reason = evaluate_listening_mode(song, prefs.listening_mode)
        if mode_score != 0.0:
            score += mode_score
            scoring_factors["listening_mode"] = mode_score
            if mode_reason:
                reasons.append(mode_reason)

    # 9. Energy Level Preference Evaluation
    if prefs.energy_level:
        el = prefs.energy_level.strip().lower()
        genre = (song.genre or "").lower()
        mood = (song.mood or "").lower()
        if el in ["energetic", "high"]:
            if any(g in genre for g in ["rock", "dance", "electronic", "metal", "pop", "hip-hop", "workout", "fitness", "edm"]) or mood in ["energetic", "happy"]:
                score += 1.5
                scoring_factors["energy_preference"] = 1.5
                reasons.append("matches your high-energy music preference")
        elif el in ["calm", "low"]:
            if any(g in genre for g in ["ambient", "acoustic", "classical", "piano", "chill", "lo-fi", "sleep", "soothing"]) or mood in ["calm", "sad", "neutral"]:
                score += 1.5
                scoring_factors["energy_preference"] = 1.5
                reasons.append("matches your calm energy preference")
        elif el in ["balanced", "medium"]:
            score += 0.5
            scoring_factors["energy_preference"] = 0.5
            reasons.append("matches your balanced listening vibe")

    # 9. Cold-start or exploratory fallback
    if score == 0.0:
        score = 0.1
        scoring_factors["catalog_discovery"] = 0.1
        reasons.append("recommended for you to discover")

    score = round(score, 2)

    # Human-readable explanation formatting
    if reasons:
        explanation = "Selected because it " + " and ".join(reasons) + "."
    else:
        explanation = "Selected for you to discover new music."

    explanation = explanation.replace("Selected because it from your saved favorites", "Selected from your saved favorites")
    return score, explanation, reasons, scoring_factors


def get_recommendations(request: RecommendRequest) -> List[RecommendationResult]:
    """
    Ranks candidates from request.catalog deterministically using user preferences.
    Deduplicates candidates and drops tracks with heavy skip/dislike penalties.
    """
    if not request.catalog:
        return []

    scored_candidates = []
    
    for song in request.catalog:
        score, explanation, reasons, scoring_factors = score_song(song, request.preferences)
        # Drop heavily penalized tracks (e.g. skipped multiple times or disliked)
        if score > -3.0:
            scored_candidates.append(
                RecommendationResult(
                    id=song.id,
                    title=song.title,
                    artist=song.artist,
                    score=score,
                    explanation=explanation,
                    reasons=reasons,
                    scoring_factors=scoring_factors,
                    is_playable=song.is_playable or bool(song.audio_url),
                    language=song.language,
                    genre=song.genre,
                    mood=song.mood,
                    provider=song.provider
                )
            )

    # Deterministic sort: Descending by score, then alphabetical by title as tie-breaker
    scored_candidates.sort(key=lambda x: (-x.score, x.title.lower(), x.artist.lower()))

    # Deduplication by ID as well as (normalized_title, normalized_artist)
    unique_results = []
    seen_ids = set()
    seen_titles_artists = set()

    for item in scored_candidates:
        title_artist_key = (normalize_string(item.title), normalize_string(item.artist))
        if item.id not in seen_ids and title_artist_key not in seen_titles_artists:
            seen_ids.add(item.id)
            seen_titles_artists.add(title_artist_key)
            unique_results.append(item)

    return unique_results[:request.limit]


def generate_mood_transition(request: TransitionRecommendRequest) -> List[TransitionStep]:
    """
    Generates a sequential mood transition path from start_mood to desired_mood.
    Steps linearly interpolate moods and ranks catalog songs appropriate for each stage.
    """
    start = request.start_mood.capitalize()
    end = request.desired_mood.capitalize()
    steps_count = request.steps_count
    
    # Path determination
    # If start and end are the same
    if start == end:
        mood_path = [start] * steps_count
    else:
        # Standard mood progression pathways
        mood_transitions_graph = {
            ("Sad", "Happy"): ["Sad", "Calm", "Neutral", "Happy"],
            ("Sad", "Energetic"): ["Sad", "Calm", "Happy", "Energetic"],
            ("Energetic", "Calm"): ["Energetic", "Happy", "Neutral", "Calm"],
            ("Happy", "Calm"): ["Happy", "Neutral", "Calm"],
            ("Neutral", "Happy"): ["Neutral", "Calm", "Happy"],
            ("Neutral", "Calm"): ["Neutral", "Calm"],
            ("Calm", "Energetic"): ["Calm", "Neutral", "Happy", "Energetic"]
        }
        
        predefined = mood_transitions_graph.get((start, end))
        if predefined and len(predefined) == steps_count:
            mood_path = predefined
        else:
            # Interpolate generic path: start -> [Neutral/intermediate] -> end
            if steps_count == 2:
                mood_path = [start, end]
            elif steps_count == 3:
                mood_path = [start, "Neutral" if start != "Neutral" and end != "Neutral" else "Calm", end]
            elif steps_count == 4:
                mood_path = [start, "Calm", "Neutral", end]
            else:
                mood_path = [start, "Calm", "Neutral", "Happy", end][:steps_count]

    used_song_ids = set()
    transition_steps = []
    
    base_prefs = request.preferences or UserPreferences(current_mood=start, desired_mood=end)

    for idx, mood in enumerate(mood_path):
        progress = round(idx / max(1, len(mood_path) - 1), 2)
        
        # Filter available catalog omitting already picked songs for variety
        remaining_catalog = [s for s in request.catalog if s.id not in used_song_ids]
        if not remaining_catalog:
            remaining_catalog = request.catalog

        sub_prefs = base_prefs.model_copy(update={
            "current_mood": mood,
            "desired_mood": mood
        })
        
        step_recs = get_recommendations(RecommendRequest(
            catalog=remaining_catalog,
            preferences=sub_prefs,
            limit=request.limit_per_step
        ))

        for r in step_recs:
            used_song_ids.add(r.id)

        transition_steps.append(
            TransitionStep(
                step_index=idx + 1,
                target_mood=mood,
                interpolated_progress=progress,
                recommended_songs=step_recs
            )
        )

    return transition_steps
