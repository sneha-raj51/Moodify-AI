#!/usr/bin/env python3
"""
Utility script to safely download and verify the FER-2013 ResNet-18 model weights
for deployment environments (e.g. Render, Railway, Docker).

Usage:
    python download_model.py [TARGET_PATH] [--url MODEL_URL]

Environment Variables:
    MODEL_URL: Direct URL to the model weights checkpoint (.pth file)
    MODEL_PATH: Destination path (defaults to models/fer2013_resnet18.pth)
"""

import os
import sys
import argparse
import json


def download_model(target_path: str = None, url: str = None) -> bool:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    if not target_path:
        target_path = os.getenv("MODEL_PATH", os.path.join(base_dir, "models", "fer2013_resnet18.pth"))
    
    target_path = os.path.abspath(target_path)
    
    if not url:
        url = os.getenv("MODEL_URL", "").strip()

    if os.path.exists(target_path) and os.path.getsize(target_path) > 10 * 1024 * 1024:
        print(f"[OK] Model checkpoint already present at: {target_path} ({os.path.getsize(target_path)} bytes)")
        return True

    if not url:
        print(f"[INFO] MODEL_URL not provided and model checkpoint missing at: {target_path}")
        print("To enable facial emotion detection in production:")
        print("  1. Host the trained fer2013_resnet18.pth file (44.8 MB) on a public URL (e.g. GitHub Releases, S3, or Hugging Face)")
        print("  2. Set MODEL_URL=<your-url> in your Render ML Service Environment Variables")
        return False

    print(f"Downloading FER-2013 ResNet-18 model from: {url}")
    print(f"Destination: {target_path}")
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    tmp_path = target_path + ".tmp"

    try:
        import httpx
        with httpx.Client(timeout=180.0, follow_redirects=True) as client:
            with client.stream("GET", url) as response:
                response.raise_for_status()
                total = int(response.headers.get("content-length", 0))
                downloaded = 0
                with open(tmp_path, "wb") as f:
                    for chunk in response.iter_bytes(chunk_size=65536):
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total > 0 and downloaded % (1024 * 1024 * 5) < 65536:
                            percent = (downloaded / total) * 100
                            print(f"  Downloaded {downloaded // (1024*1024)}MB / {total // (1024*1024)}MB ({percent:.1f}%)")

        final_size = os.path.getsize(tmp_path)
        if final_size < 10 * 1024 * 1024:
            raise ValueError(f"Downloaded file is too small ({final_size} bytes), expected ~44.8 MB")

        if os.path.exists(target_path):
            os.remove(target_path)
        os.replace(tmp_path, target_path)
        print(f"[SUCCESS] Model checkpoint successfully saved to {target_path} ({final_size} bytes)")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to download model: {e}")
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download FER-2013 model weights for Moodify AI")
    parser.add_argument("target", nargs="?", default=None, help="Target path for model .pth file")
    parser.add_argument("--url", default=None, help="URL to download the model from")
    args = parser.parse_args()

    success = download_model(args.target, args.url)
    sys.exit(0 if success else 1)
