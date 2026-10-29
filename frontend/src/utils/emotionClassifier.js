import { API_BASE_URL, getAuthHeaders } from '../services/api';

let isLoading = false;

export const loadEmotionModel = async () => {
  return true;
};

export const predictEmotionFromVideo = async (videoElement, boundingBox) => {
    // Ensure valid video and bounding box
    if (!videoElement || !boundingBox || boundingBox.width <= 0 || boundingBox.height <= 0) return null;
    
    const vWidth = videoElement.videoWidth;
    const vHeight = videoElement.videoHeight;
    if (!vWidth || !vHeight || vWidth <= 0 || vHeight <= 0) return null;

    // Add ~18% margin around MediaPipe bounding box to capture full face (forehead, chin, smile corners)
    // matching canonical FER-2013 face framing distribution and preventing clipped facial features
    const padX = boundingBox.width * 0.18;
    const padY = boundingBox.height * 0.18;

    const sx = Math.max(0, boundingBox.originX - padX);
    const sy = Math.max(0, boundingBox.originY - padY);
    const sRight = Math.min(vWidth, boundingBox.originX + boundingBox.width + padX);
    const sBottom = Math.min(vHeight, boundingBox.originY + boundingBox.height + padY);

    const sWidth = Math.round(sRight - sx);
    const sHeight = Math.round(sBottom - sy);

    if (sWidth < 20 || sHeight < 20) return null;

    // Create an offscreen canvas for the crop
    const canvas = document.createElement('canvas');
    canvas.width = sWidth;
    canvas.height = sHeight;
    const ctx = canvas.getContext('2d');
    
    ctx.drawImage(
      videoElement,
      sx, sy, sWidth, sHeight,
      0, 0, sWidth, sHeight
    );

    // Convert canvas to blob and send to backend
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob) return null;
    
    const formData = new FormData();
    formData.append('file', blob, 'face.jpg');
    formData.append('is_cropped', 'true');

    const headers = getAuthHeaders();
    delete headers['Content-Type']; // Let browser set boundary

    const res = await fetch(`${API_BASE_URL}/ml/predict`, {
      method: 'POST',
      headers,
      body: formData
    });

    if (!res.ok) {
      let errDetail = '';
      try {
        const errJson = await res.json();
        errDetail = errJson.message || errJson.detail || '';
      } catch (_) {
        // Fallback if response body is not JSON
      }

      const err = new Error(errDetail || `ML service error (HTTP ${res.status})`);
      err.status = res.status;
      err.detail = errDetail;
      throw err;
    }

    const data = await res.json();
    if (!data || !data.expression) {
      const err = new Error('Invalid prediction response from ML service');
      err.status = 502;
      throw err;
    }

    const confidenceVal = typeof data.confidence === 'number' ? data.confidence : 0;
    const thresholdVal = typeof data.confidence_threshold === 'number' ? data.confidence_threshold : 0.50;
    const isLowConfidence = typeof data.low_confidence === 'boolean' ? data.low_confidence : (confidenceVal < thresholdVal);
    const probabilities = data.class_probabilities || data.scores || {};

    return {
      expression: data.expression || data.predicted_emotion,
      predicted_emotion: data.predicted_emotion || data.expression,
      confidence: confidenceVal,
      scores: probabilities,
      class_probabilities: probabilities,
      all: probabilities,
      low_confidence: isLowConfidence,
      confidence_threshold: thresholdVal,
      model_version: data.model_version || 'resnet18-fer2013-v1.1',
      cropInfo: {
        sx: Math.round(sx),
        sy: Math.round(sy),
        width: sWidth,
        height: sHeight,
        videoTime: typeof videoElement.currentTime === 'number' ? videoElement.currentTime : 0,
        blobSize: blob.size
      }
    };
};
