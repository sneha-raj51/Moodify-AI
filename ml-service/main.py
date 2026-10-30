from fastapi import FastAPI, UploadFile, File, Form, Query, HTTPException
from typing import List, Optional
from contextlib import asynccontextmanager
from starlette.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import cv2
import numpy as np
import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image
import os
import io
import json

from recommender import (
    RecommendRequest,
    RecommendationResult,
    get_recommendations,
    TransitionRecommendRequest,
    TransitionStep,
    generate_mood_transition,
)

# Configuration
EMOTIONS = ["angry", "disgust", "fear", "happy", "sad", "surprise", "neutral"]
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.50"))
MODEL_VERSION = os.getenv("MODEL_VERSION", "resnet18-fer2013-v1.1")
HAAR_CASCADE_PATH = (
    os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    if getattr(cv2, 'data', None) and hasattr(cv2.data, 'haarcascades')
    else None
)

def resolve_model_path() -> str:
    """
    Robustly resolves the FER-2013 ResNet-18 model checkpoint path
    across different working directories in development and production containers.
    """
    env_path = os.getenv("MODEL_PATH")
    if env_path and os.path.exists(env_path):
        return os.path.abspath(env_path)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        env_path,
        os.path.join(base_dir, "models", "fer2013_resnet18.pth"),
        os.path.join(base_dir, "models", "resnet18_transfer_v1.pth"),
        os.path.join(base_dir, "..", "models", "fer2013_resnet18.pth"),
        os.path.join(os.getcwd(), "models", "fer2013_resnet18.pth"),
        os.path.join(os.getcwd(), "ml-service", "models", "fer2013_resnet18.pth"),
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return os.path.abspath(c)

    target = env_path if env_path else os.path.join(base_dir, "models", "fer2013_resnet18.pth")
    return os.path.abspath(target)


def download_model_if_needed(target_path: str) -> bool:
    """
    If the model weights file does not exist on disk, check for MODEL_URL
    environment variable and download the trained weights if provided.
    """
    if os.path.exists(target_path) and os.path.getsize(target_path) > 1024 * 1024:
        return True

    model_url = os.getenv("MODEL_URL", "").strip()
    if not model_url:
        return False

    print(f"Model file not found at {target_path}. Attempting download from MODEL_URL: {model_url}")
    os.makedirs(os.path.dirname(os.path.abspath(target_path)), exist_ok=True)
    tmp_path = target_path + ".tmp"
    try:
        import httpx
        with httpx.Client(timeout=180.0, follow_redirects=True) as client:
            with client.stream("GET", model_url) as response:
                response.raise_for_status()
                with open(tmp_path, "wb") as f:
                    for chunk in response.iter_bytes(chunk_size=65536):
                        f.write(chunk)

        downloaded_size = os.path.getsize(tmp_path)
        if downloaded_size > 10 * 1024 * 1024:
            if os.path.exists(target_path):
                os.remove(target_path)
            os.replace(tmp_path, target_path)
            print(f"Model downloaded successfully to {target_path} ({downloaded_size} bytes).")
            return True
        else:
            print(f"Downloaded model file too small ({downloaded_size} bytes). Discarding.")
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            return False
    except Exception as e:
        print(f"Failed to download model from {model_url}: {e}")
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
        return False


MODEL_PATH = resolve_model_path()

# Model Architecture (must match the saved weights)
class FaceEmotionModel(nn.Module):
    def __init__(self, num_classes):
        super(FaceEmotionModel, self).__init__()
        self.resnet = models.resnet18(weights=None)
        self.resnet.fc = nn.Linear(self.resnet.fc.in_features, num_classes)

    def forward(self, x):
        return self.resnet(x)

# Global states
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = None
face_cascade = None
model_ready = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, face_cascade, model_ready
    if hasattr(cv2, 'CascadeClassifier') and HAAR_CASCADE_PATH and os.path.exists(HAAR_CASCADE_PATH):
        try:
            print("Loading Haar Cascade for face detection...")
            cascade = cv2.CascadeClassifier(HAAR_CASCADE_PATH)
            if not cascade.empty():
                face_cascade = cascade
                print("Haar Cascade loaded successfully.")
            else:
                print(f"Haar cascade failed to load from {HAAR_CASCADE_PATH} (cascade is empty).")
                face_cascade = None
        except Exception as e:
            print(f"Haar cascade load failed: {e}")
            face_cascade = None
    else:
        print("Haar CascadeClassifier or cascade file not available in this OpenCV build.")
        face_cascade = None

    resolved_path = resolve_model_path()
    if not os.path.exists(resolved_path):
        download_model_if_needed(resolved_path)

    print(f"Attempting to load PyTorch model from {resolved_path}...")
    if os.path.exists(resolved_path):
        metadata_path = resolved_path.replace(".pth", "_metadata.json")
        if not os.path.exists(metadata_path):
            base_dir = os.path.dirname(os.path.abspath(__file__))
            alt_meta = os.path.join(base_dir, "models", "fer2013_metadata.json")
            if os.path.exists(alt_meta):
                metadata_path = alt_meta

        if os.path.exists(metadata_path):
            try:
                with open(metadata_path, "r") as f:
                    metadata = json.load(f)
                if metadata.get("emotions") != EMOTIONS or metadata.get("architecture") != "ResNet18":
                    print("Incompatible metadata found! Rejecting checkpoint.")
                    yield
                    return
            except Exception as e:
                print(f"Error loading metadata: {e}")

        try:
            model = FaceEmotionModel(num_classes=len(EMOTIONS))
            ckpt = torch.load(resolved_path, map_location=device, weights_only=True)
            if any(k.startswith("resnet.") for k in ckpt.keys()):
                model.load_state_dict(ckpt, strict=True)
            else:
                remapped = {f"resnet.{k}": v for k, v in ckpt.items()}
                model.load_state_dict(remapped, strict=True)
            model.to(device)
            model.eval()
            model_ready = True
            print("Emotion classification model loaded successfully.")
        except Exception as e:
            print(f"Error loading model weights: {e}")
    else:
        print(f"Emotion model file {resolved_path} not found. Service will report model_ready=False.")

    yield


app = FastAPI(title="Moodify AI ML & Recommendation Service", version="1.1.0", lifespan=lifespan)

cors_origins_env = os.getenv("CORS_ORIGINS", "*")
configured_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
is_wildcard = "*" in configured_origins or cors_origins_env.strip() == "*"

if is_wildcard:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https://.*\.vercel\.app$|^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=configured_origins,
        allow_origin_regex=r"^https://.*\.vercel\.app$|^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


class HealthResponse(BaseModel):
    status: str
    model_ready: bool
    recommender_ready: bool
    device: str
    emotion_model_missing: bool


@app.get("/health", response_model=HealthResponse)
def health_check():
    return {
        "status": "ok",
        "model_ready": model_ready,
        "recommender_ready": True,
        "device": str(device),
        "emotion_model_missing": not model_ready,
    }


class PredictResponse(BaseModel):
    expression: str
    predicted_emotion: str
    confidence: float
    scores: dict
    class_probabilities: dict
    low_confidence: bool
    confidence_threshold: float
    faces_detected: int
    model_version: Optional[str] = None


def preprocess_face(face_img):
    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    return transform(face_img).unsqueeze(0).to(device)


def process_and_predict(contents: bytes, cropped: bool):
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image format")

    if cropped:
        # Validate that the cropped image has valid dimensions (at least 20x20 pixels)
        h, w = img.shape[:2]
        if h < 20 or w < 20:
            raise HTTPException(
                status_code=400,
                detail="Invalid cropped face dimensions (must be at least 20x20 pixels)"
            )
        face_roi = img
    else:
        # Full-frame input: perform face detection with Haar Cascade
        if face_cascade is None or (hasattr(face_cascade, 'empty') and face_cascade.empty()):
            raise HTTPException(
                status_code=503,
                detail="face_detector_unavailable: Face detector is unavailable. Please select your mood manually.",
            )

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))

        if len(faces) == 0:
            raise HTTPException(status_code=400, detail="no_face_detected")
        if len(faces) > 1:
            raise HTTPException(status_code=400, detail="multiple_faces_detected")

        x, y, w, h = faces[0]
        face_roi = img[y : y + h, x : x + w]

    # Align face ROI with FER-2013 training domain (where all images are single-channel grayscale replicated to 3 RGB channels).
    # Live webcam frames are 24-bit color where human skin tones (R >> B) introduce severe out-of-distribution
    # chromatic imbalance that degrades ResNet-18 emotion classification. Converting to grayscale eliminates color bias.
    if len(face_roi.shape) == 2:
        gray_roi = face_roi
    elif face_roi.shape[2] == 1:
        gray_roi = face_roi[:, :, 0]
    else:
        gray_roi = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)

    face_rgb = cv2.cvtColor(gray_roi, cv2.COLOR_GRAY2RGB)
    pil_img = Image.fromarray(face_rgb)
    input_tensor = preprocess_face(pil_img)

    with torch.no_grad():
        outputs = model(input_tensor)
        probs = torch.nn.functional.softmax(outputs, dim=1).squeeze().cpu().numpy()

    # Validate that probabilities are finite and correctly normalized
    probs = np.nan_to_num(probs, nan=0.0, posinf=1.0, neginf=0.0)
    prob_sum = float(np.sum(probs))
    if prob_sum > 0:
        probs = probs / prob_sum
    else:
        probs = np.ones(len(EMOTIONS)) / float(len(EMOTIONS))

    pred_idx = int(np.argmax(probs))
    confidence = float(np.round(float(probs[pred_idx]), 4))
    expression = EMOTIONS[pred_idx]
    class_probabilities = {EMOTIONS[i]: float(np.round(float(probs[i]), 4)) for i in range(len(EMOTIONS))}
    low_confidence = bool(confidence < CONFIDENCE_THRESHOLD)

    return {
        "expression": expression,
        "predicted_emotion": expression,
        "confidence": confidence,
        "scores": class_probabilities,
        "class_probabilities": class_probabilities,
        "low_confidence": low_confidence,
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "faces_detected": 1,
        "model_version": MODEL_VERSION,
    }


@app.post("/predict", response_model=PredictResponse)
async def predict_emotion(
    file: UploadFile = File(...),
    is_cropped: Optional[bool] = Form(None),
    is_cropped_query: Optional[bool] = Query(None, alias="is_cropped"),
):
    if not model_ready:
        raise HTTPException(
            status_code=503,
            detail="model_not_ready: Emotion model weights are missing. Please select your mood manually.",
        )

    cropped = bool(is_cropped or is_cropped_query)
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty image file provided")

    try:
        return await run_in_threadpool(process_and_predict, contents, cropped)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/recommend", response_model=List[RecommendationResult])
async def recommend_songs(request: RecommendRequest):
    try:
        return get_recommendations(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommendation engine error: {str(e)}")


@app.post("/recommend/transition", response_model=List[TransitionStep])
async def recommend_transition(request: TransitionRecommendRequest):
    try:
        return generate_mood_transition(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transition recommendation error: {str(e)}")
