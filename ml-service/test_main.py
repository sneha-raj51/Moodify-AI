from fastapi.testclient import TestClient
import pytest
from main import app, EMOTIONS, preprocess_face
from recommender import (
    SongCandidate,
    UserPreferences,
    HistoryItem,
    RecommendRequest,
    score_song,
    get_recommendations,
    TransitionRecommendRequest,
    generate_mood_transition
)
from train import FER2013Dataset
import io
import os
import torch
import json
import pandas as pd
from PIL import Image

client = TestClient(app)


def create_test_image(color=(255, 0, 0)):
    img = Image.new('RGB', (100, 100), color=color)
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    buf.seek(0)
    return buf


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "model_ready" in data
    assert "recommender_ready" in data
    assert data["recommender_ready"] is True
    assert "emotion_model_missing" in data


def test_invalid_image():
    response = client.post("/predict", files={"file": ("test.txt", b"not an image", "text/plain")})
    # Since model weights are missing by default, verify 503
    if response.status_code == 503:
        assert "model_not_ready" in response.json()["detail"]
    else:
        assert response.status_code == 400
        assert "Invalid image format" in response.json()["detail"]


def test_no_face_detected():
    img_buf = create_test_image(color=(0, 0, 0))
    response = client.post("/predict", files={"file": ("blank.jpg", img_buf, "image/jpeg")})
    if response.status_code == 503:
        assert "model_not_ready" in response.json()["detail"]
    else:
        assert response.status_code == 400
        assert response.json()["detail"] == "no_face_detected"


def test_health_endpoint_with_lifespan():
    with TestClient(app) as test_client:
        response = test_client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["model_ready"] is True
        assert data["recommender_ready"] is True
        assert data["emotion_model_missing"] is False


def test_predict_with_valid_face_image():
    sample_face_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "frontend",
        "node_modules",
        "@vladmandic",
        "face-api",
        "demo",
        "sample4.jpg"
    )
    if not os.path.exists(sample_face_path):
        pytest.skip("Sample face image not found")

    with open(sample_face_path, "rb") as f:
        face_bytes = f.read()

    with TestClient(app) as test_client:
        response = test_client.post("/predict", files={"file": ("face.jpg", face_bytes, "image/jpeg")})
        assert response.status_code == 200
        data = response.json()
        assert data["expression"] in EMOTIONS
        assert isinstance(data["confidence"], float)
        assert 0.0 <= data["confidence"] <= 1.0
        assert data["faces_detected"] == 1
        assert len(data["scores"]) == 7
        for emo in EMOTIONS:
            assert emo in data["scores"]


def test_predict_no_face_detected_with_lifespan():
    img_buf = create_test_image(color=(0, 0, 0))
    with TestClient(app) as test_client:
        response = test_client.post("/predict", files={"file": ("blank.jpg", img_buf, "image/jpeg")})
        assert response.status_code == 400
        assert response.json()["detail"] == "no_face_detected"


def test_predict_face_detector_unavailable():
    import main
    orig_cascade = main.face_cascade
    try:
        main.face_cascade = None
        with TestClient(app) as test_client:
            main.face_cascade = None
            img_buf = create_test_image(color=(0, 0, 0))
            response = test_client.post("/predict", files={"file": ("test.jpg", img_buf, "image/jpeg")})
            assert response.status_code == 503
            assert "face_detector_unavailable" in response.json()["detail"]
    finally:
        main.face_cascade = orig_cascade



def test_class_mapping():
    assert EMOTIONS == ['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral']
    assert len(EMOTIONS) == 7


def test_inference_preprocessing_consistency():
    img = Image.new('RGB', (48, 48), color='black')
    tensor = preprocess_face(img)
    assert tensor.shape == (1, 3, 224, 224)


def test_dataset_validation(tmp_path):
    invalid_csv = tmp_path / "invalid.csv"
    pd.DataFrame({"wrong_col": [1]}).to_csv(invalid_csv, index=False)

    with pytest.raises(ValueError, match="Dataset missing required columns"):
        FER2013Dataset(str(invalid_csv))

    valid_csv = tmp_path / "valid.csv"
    pd.DataFrame({
        "emotion": [0],
        "pixels": [" ".join(["0"] * 2304)],
        "Usage": ["Training"]
    }).to_csv(valid_csv, index=False)

    dataset = FER2013Dataset(str(valid_csv))
    assert len(dataset) == 1
    img, emotion = dataset[0]
    assert emotion == 0
    assert img.size == (48, 48)


def test_checkpoint_save_load_compatibility(tmp_path):
    from train import FaceEmotionModel

    model_path = tmp_path / "test_model.pth"
    meta_path = tmp_path / "test_metadata.json"

    model = FaceEmotionModel(num_classes=7)
    torch.save(model.state_dict(), model_path)

    with open(meta_path, 'w') as f:
        json.dump({
            "architecture": "ResNet18",
            "emotions": EMOTIONS
        }, f)

    model_new = FaceEmotionModel(num_classes=7)
    model_new.load_state_dict(torch.load(model_path, weights_only=True))
    assert model_new is not None


# =========================================================================
# RECOMMENDATION ENGINE TESTS
# =========================================================================

def test_recommendation_ranking_and_deduplication():
    request_data = {
        "catalog": [
            {"id": "1", "title": "Song A", "artist": "Artist A", "genre": "Pop", "mood": "happy", "language": "English", "provider": "local"},
            {"id": "2", "title": "Song B", "artist": "Artist B", "genre": "Rock", "mood": "sad", "language": "English", "provider": "local"},
            {"id": "3", "title": "Song C", "artist": "Artist C", "genre": "Pop", "mood": "happy", "language": "Hindi", "provider": "local"},
            {"id": "3", "title": "Song C", "artist": "Artist C", "genre": "Pop", "mood": "happy", "language": "Hindi", "provider": "local"},  # duplicate id
            {"id": "4", "title": "Song A", "artist": "Artist A", "genre": "Pop", "mood": "happy", "language": "English", "provider": "local"}   # duplicate title+artist
        ],
        "preferences": {
            "current_mood": "happy",
            "favorite_genres": ["Pop"],
            "favorite_song_ids": ["1"],
            "preferred_languages": ["Hindi"],
            "recent_history": [{"id": "1", "title": "Song A", "skipped": True}]
        },
        "limit": 10
    }

    response = client.post("/recommend", json=request_data)
    assert response.status_code == 200
    results = response.json()

    # Total 5 candidates, but Song C duplicated (id 3), Song A duplicated (id 4 has same title+artist)
    # Remaining unique: Song C, Song B (Song A was penalized for skip)
    assert len(results) >= 2
    ids = [r["id"] for r in results]
    assert "3" in ids
    # Song C matches mood(3.0) + genre(2.0) + language(2.5) = 7.5
    assert results[0]["id"] == "3"
    assert results[0]["score"] == 7.5


def test_recommendation_language_preference_and_unknown_language():
    catalog = [
        SongCandidate(id="h1", title="Tum Hi Ho", artist="Arijit Singh", mood="Sad", language="Hindi", provider="local"),
        SongCandidate(id="p1", title="Amplifier", artist="Imran Khan", mood="Sad", language="Punjabi", provider="local"),
        SongCandidate(id="e1", title="Someone Like You", artist="Adele", mood="Sad", language="English", provider="local"),
        SongCandidate(id="u1", title="Ambient Waves", artist="Soundscape", mood="Sad", language=None, provider="local"),
    ]

    # Test Hindi preference
    req_hindi = RecommendRequest(
        catalog=catalog,
        preferences=UserPreferences(current_mood="Sad", preferred_languages=["Hindi"]),
        limit=5
    )
    recs_hindi = get_recommendations(req_hindi)
    assert recs_hindi[0].id == "h1"
    assert "matches preferred language (Hindi)" in recs_hindi[0].explanation

    # Unknown language track (u1) should not be penalized or guessed
    u_track = next(r for r in recs_hindi if r.id == "u1")
    assert u_track.language is None
    assert u_track.score == 3.0  # matches Sad mood (3.0), language was neither penalized nor rewarded


def test_recommendation_skip_penalty_and_recency():
    catalog = [
        SongCandidate(id="s1", title="Happy Song 1", artist="Artist 1", mood="Happy", provider="local"),
        SongCandidate(id="s2", title="Happy Song 2", artist="Artist 2", mood="Happy", provider="local"),
    ]

    # User skipped s1
    prefs = UserPreferences(
        current_mood="Happy",
        recent_history=[
            HistoryItem(id="s1", title="Happy Song 1", skipped=True)
        ]
    )

    recs = get_recommendations(RecommendRequest(catalog=catalog, preferences=prefs))
    # s2 should be ranked top
    assert recs[0].id == "s2"
    assert recs[0].score == 3.0
    
    # If s1 is present, score must be negative due to skip (-5)
    s1_matches = [r for r in recs if r.id == "s1"]
    if s1_matches:
        assert s1_matches[0].score < 0


def test_recommendation_cold_start():
    request_data = {
        "catalog": [
            {"id": "1", "title": "Song A", "artist": "Artist A", "provider": "local"}
        ],
        "preferences": {
            "current_mood": "neutral"
        },
        "limit": 5
    }

    response = client.post("/recommend", json=request_data)
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["score"] == 0.1
    assert "discover" in results[0]["explanation"].lower()


def test_missing_catalog_empty_behavior():
    request_data = {
        "catalog": [],
        "preferences": {
            "current_mood": "Happy"
        },
        "limit": 10
    }
    response = client.post("/recommend", json=request_data)
    assert response.status_code == 200
    assert response.json() == []


def test_mood_transition_endpoint():
    request_data = {
        "catalog": [
            {"id": "1", "title": "Sad Piano", "artist": "Calm Guy", "mood": "Sad", "provider": "local"},
            {"id": "2", "title": "Peaceful Forest", "artist": "Ambient Guy", "mood": "Calm", "provider": "local"},
            {"id": "3", "title": "Gentle Breeze", "artist": "Nature Sounds", "mood": "Neutral", "provider": "local"},
            {"id": "4", "title": "Upbeat Beat", "artist": "Happy Guy", "mood": "Happy", "provider": "local"}
        ],
        "start_mood": "Sad",
        "desired_mood": "Happy",
        "steps_count": 4,
        "limit_per_step": 1
    }

    response = client.post("/recommend/transition", json=request_data)
    assert response.status_code == 200
    steps = response.json()
    assert len(steps) == 4
    assert steps[0]["target_mood"] == "Sad"
    assert steps[-1]["target_mood"] == "Happy"
    assert len(steps[0]["recommended_songs"]) == 1
    assert steps[0]["recommended_songs"][0]["id"] == "1"


def test_fastapi_request_validation():
    # Missing required 'current_mood' in preferences
    bad_data = {
        "catalog": [],
        "preferences": {}
    }
    response = client.post("/recommend", json=bad_data)
    assert response.status_code == 422  # Pydantic validation error


def test_explainable_recommendations_scoring_factors_and_reasons():
    request_data = {
        "catalog": [
            {
                "id": "exp_1",
                "title": "Chai Met Sunset",
                "artist": "Acoustic Duo",
                "genre": "Acoustic",
                "mood": "Calm",
                "language": "Hindi",
                "provider": "local"
            }
        ],
        "preferences": {
            "current_mood": "Calm",
            "favorite_genres": ["Acoustic"],
            "favorite_song_ids": ["exp_1"],
            "preferred_languages": ["Hindi"]
        },
        "limit": 5
    }

    response = client.post("/recommend", json=request_data)
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    song = results[0]

    # Verify explainable data structures exist
    assert "reasons" in song
    assert "scoring_factors" in song
    assert isinstance(song["reasons"], list)
    assert isinstance(song["scoring_factors"], dict)

    # Verify actual scoring factors match inputs
    factors = song["scoring_factors"]
    assert factors["mood_compatibility"] == 3.0
    assert factors["genre_preference"] == 2.0
    assert factors["language_preference"] == 2.5
    assert factors["favorite_bonus"] == 1.5
    # Total score = 3.0 + 2.0 + 2.5 + 1.5 = 9.0
    assert song["score"] == 9.0

    # Verify reasons
    reasons_text = " ".join(song["reasons"]).lower()
    assert "calm mood" in reasons_text
    assert "acoustic" in reasons_text
    assert "hindi" in reasons_text
    assert "saved favorites" in reasons_text


def test_feedback_personalization_influence_and_bounded_scores():
    catalog = [
        {"id": "f_1", "title": "Liked Track", "artist": "Artist 1", "mood": "Happy", "genre": "Pop", "provider": "local"},
        {"id": "f_2", "title": "Disliked Track", "artist": "Artist 2", "mood": "Happy", "genre": "Pop", "provider": "local"},
        {"id": "f_3", "title": "Neutral Track", "artist": "Artist 3", "mood": "Happy", "genre": "Pop", "provider": "local"}
    ]

    request_data = {
        "catalog": catalog,
        "preferences": {
            "current_mood": "Happy",
            "feedback_likes": ["f_1"],
            "feedback_dislikes": ["f_2"]
        },
        "limit": 5
    }

    response = client.post("/recommend", json=request_data)
    assert response.status_code == 200
    results = response.json()
    result_ids = [r["id"] for r in results]

    # Liked track must be ranked top with positive feedback bonus
    assert result_ids[0] == "f_1"
    assert results[0]["scoring_factors"]["feedback_positive"] == 2.0
    assert "positively rated" in results[0]["explanation"].lower()

    # Disliked track f_2 must be suppressed/filtered (score -7.0 <= -3.0 threshold)
    assert "f_2" not in result_ids


def test_smart_listening_modes_ranking_and_fallbacks():
    catalog = [
        {"id": "m_study", "title": "Focus Piano", "artist": "Instrumentalist", "mood": "Calm", "genre": "Classical", "provider": "local"},
        {"id": "m_workout", "title": "Heavy Beats", "artist": "EDM Club", "mood": "Energetic", "genre": "Electronic", "provider": "local"},
        {"id": "m_sleep", "title": "Midnight Rain", "artist": "Ambient Sound", "mood": "Calm", "genre": "Ambient", "provider": "local"},
        {"id": "m_fallback", "title": "Unclassified Track", "artist": "Indie Solo", "mood": "Neutral", "genre": None, "provider": "local"}
    ]

    # 1. Test Study Mode
    res_study = client.post("/recommend", json={
        "catalog": catalog,
        "preferences": {
            "current_mood": "Calm",
            "listening_mode": "Study"
        },
        "limit": 5
    })
    assert res_study.status_code == 200
    study_recs = res_study.json()
    assert study_recs[0]["id"] == "m_study"
    assert "study mode" in study_recs[0]["explanation"].lower()
    assert study_recs[0]["scoring_factors"]["listening_mode"] == 2.5

    # 2. Test Workout Mode
    res_workout = client.post("/recommend", json={
        "catalog": catalog,
        "preferences": {
            "current_mood": "Energetic",
            "listening_mode": "Workout"
        },
        "limit": 5
    })
    assert res_workout.status_code == 200
    workout_recs = res_workout.json()
    assert workout_recs[0]["id"] == "m_workout"
    assert "workout mode" in workout_recs[0]["explanation"].lower()

    # 3. Test Sleep Mode
    res_sleep = client.post("/recommend", json={
        "catalog": catalog,
        "preferences": {
            "current_mood": "Calm",
            "listening_mode": "Sleep"
        },
        "limit": 5
    })
    assert res_sleep.status_code == 200
    sleep_recs = res_sleep.json()
    assert sleep_recs[0]["id"] == "m_sleep"
    assert "sleep mode" in sleep_recs[0]["explanation"].lower()

    # 4. Fallback behavior when metadata missing (no fabricated values)
    track_fallback = next(r for r in study_recs if r["id"] == "m_fallback")
    assert track_fallback["genre"] is None
    assert "study mode fallback" in track_fallback["explanation"].lower()


def test_predict_cropped_face_bypasses_haar():
    """Valid cropped face (even a uniform crop where Haar fails) succeeds with is_cropped=true."""
    img_buf = create_test_image(color=(120, 150, 180))
    with TestClient(app) as test_client:
        response = test_client.post(
            "/predict",
            files={"file": ("face_crop.jpg", img_buf, "image/jpeg")},
            data={"is_cropped": "true"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["expression"] in EMOTIONS
        assert isinstance(data["confidence"], float)
        assert 0.0 <= data["confidence"] <= 1.0
        assert data["faces_detected"] == 1
        assert len(data["scores"]) == 7
        for emo in EMOTIONS:
            assert emo in data["scores"]


def test_predict_cropped_face_query_param():
    """is_cropped passed as URL query parameter is also recognized."""
    img_buf = create_test_image(color=(90, 100, 110))
    with TestClient(app) as test_client:
        response = test_client.post(
            "/predict?is_cropped=true",
            files={"file": ("crop.jpg", img_buf, "image/jpeg")}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["expression"] in EMOTIONS
        assert data["faces_detected"] == 1


def test_predict_cropped_face_dimension_validation():
    """Cropped face with invalid dimensions (< 20x20) is safely rejected."""
    tiny_img = Image.new('RGB', (15, 15), color=(200, 200, 200))
    buf = io.BytesIO()
    tiny_img.save(buf, format='JPEG')
    buf.seek(0)

    with TestClient(app) as test_client:
        response = test_client.post(
            "/predict",
            files={"file": ("tiny.jpg", buf, "image/jpeg")},
            data={"is_cropped": "true"}
        )
        assert response.status_code == 400
        assert "dimensions" in response.json()["detail"].lower()


def test_predict_empty_file_rejected():
    """Empty image file is safely rejected with 400."""
    with TestClient(app) as test_client:
        response = test_client.post(
            "/predict",
            files={"file": ("empty.jpg", b"", "image/jpeg")},
            data={"is_cropped": "true"}
        )
        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()


def test_predict_full_frame_retains_haar_detection():
    """Full-frame input without is_cropped=true continues to run Haar face detection and returns no_face_detected for blank image."""
    blank_buf = create_test_image(color=(50, 50, 50))
    with TestClient(app) as test_client:
        response = test_client.post(
            "/predict",
            files={"file": ("blank.jpg", blank_buf, "image/jpeg")},
            data={"is_cropped": "false"}
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "no_face_detected"


def test_predict_confidence_and_probabilities_structure():
    """Emotion confidence, class probabilities, and low-confidence flag are properly computed and returned."""
    sample_face_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "frontend",
        "node_modules",
        "@vladmandic",
        "face-api",
        "demo",
        "sample4.jpg"
    )
    if not os.path.exists(sample_face_path):
        pytest.skip("Sample face image not found")

    with open(sample_face_path, "rb") as f:
        face_bytes = f.read()

    with TestClient(app) as test_client:
        response = test_client.post(
            "/predict",
            files={"file": ("face.jpg", face_bytes, "image/jpeg")},
            data={"is_cropped": "true"}
        )
        assert response.status_code == 200
        data = response.json()

        # Both legacy and new fields
        assert "expression" in data
        assert "predicted_emotion" in data
        assert data["expression"] == data["predicted_emotion"]
        assert data["predicted_emotion"] in EMOTIONS

        # Confidence validation
        assert "confidence" in data
        assert isinstance(data["confidence"], float)
        assert 0.0 <= data["confidence"] <= 1.0

        # Class probabilities validation
        assert "class_probabilities" in data
        assert "scores" in data
        assert len(data["class_probabilities"]) == 7
        for emo in EMOTIONS:
            assert emo in data["class_probabilities"]
            prob = data["class_probabilities"][emo]
            assert isinstance(prob, float)
            assert 0.0 <= prob <= 1.0

        # Probabilities must sum to ~1.0
        prob_sum = sum(data["class_probabilities"].values())
        assert abs(prob_sum - 1.0) < 0.01

        # Max emotion must match predicted_emotion
        top_emo = max(data["class_probabilities"].items(), key=lambda x: x[1])[0]
        assert top_emo == data["predicted_emotion"]
        assert abs(data["class_probabilities"][top_emo] - data["confidence"]) < 0.001

        # Low-confidence flag and threshold
        assert "low_confidence" in data
        assert isinstance(data["low_confidence"], bool)
        assert "confidence_threshold" in data
        assert data["confidence_threshold"] == 0.50
        assert data["low_confidence"] == (data["confidence"] < data["confidence_threshold"])

        # Model version metadata
        assert "model_version" in data
        assert data["model_version"] == "resnet18-fer2013-v1.1"


