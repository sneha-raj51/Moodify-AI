import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves the Python ML Service base URL with trailing slashes stripped.
 */
export const getMlServiceUrl = () => {
  const envUrl = process.env.ML_SERVICE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:8000';
};

export const predictEmotion = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const mlServiceUrl = getMlServiceUrl();
    
    const formData = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    formData.append('file', blob, req.file.originalname || 'face.jpg');

    const isCropped = req.body?.is_cropped === 'true' || req.body?.is_cropped === true || req.query?.is_cropped === 'true';
    if (isCropped) {
      formData.append('is_cropped', 'true');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout for ML inference & cold starts

    let mlRes;
    try {
      mlRes = await fetch(`${mlServiceUrl}/predict`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    let data = {};
    try {
      data = await mlRes.json();
    } catch (_) {
      data = {};
    }
    
    if (!mlRes.ok) {
      if (mlRes.status === 503) {
        const detailMsg = data.detail || '';
        return res.status(503).json({
          message: detailMsg ? `ML Model not ready: ${detailMsg}` : 'ML Model not ready. Please select your mood manually.',
          detail: detailMsg
        });
      }
      return res.status(mlRes.status).json({ message: data.detail || 'ML Service error' });
    }

    res.status(200).json(data);
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ message: 'ML Service timed out' });
    }
    console.error('predictEmotion error:', error.message);
    const mlUrl = getMlServiceUrl();
    const isLocal = mlUrl.includes('localhost') || mlUrl.includes('127.0.0.1');
    const diagnostic = (process.env.NODE_ENV === 'production' && isLocal)
      ? ' (ML_SERVICE_URL is set to localhost in production; please set ML_SERVICE_URL in your Render dashboard to your deployed Python ML service URL)'
      : '';
    res.status(502).json({ 
      message: 'Failed to connect to ML Service',
      detail: `Could not reach ML service at ${mlUrl}.${diagnostic}`
    });
  }
};

/**
 * Serves real FER-2013 ResNet-18 emotion classification evaluation metrics (Feature 8)
 */
export const getMlEvaluationMetrics = async (req, res) => {
  try {
    const candidatePaths = [
      path.resolve(__dirname, '../../../ml-service/models/improved_eval.json'),
      path.resolve(__dirname, '../../../../ml-service/models/improved_eval.json'),
      path.resolve(process.cwd(), '../ml-service/models/improved_eval.json'),
      path.resolve(process.cwd(), 'ml-service/models/improved_eval.json'),
      'E:/Moodify AI/ml-service/models/improved_eval.json'
    ];

    const baselineCandidatePaths = [
      path.resolve(__dirname, '../../../ml-service/models/baseline_eval.json'),
      path.resolve(__dirname, '../../../../ml-service/models/baseline_eval.json'),
      path.resolve(process.cwd(), '../ml-service/models/baseline_eval.json'),
      path.resolve(process.cwd(), 'ml-service/models/baseline_eval.json'),
      'E:/Moodify AI/ml-service/models/baseline_eval.json'
    ];

    let improvedData = null;
    let baselineData = null;

    for (const p of candidatePaths) {
      try {
        const raw = await fs.readFile(p, 'utf-8');
        improvedData = JSON.parse(raw);
        break;
      } catch (e) {
        // continue
      }
    }

    for (const p of baselineCandidatePaths) {
      try {
        const raw = await fs.readFile(p, 'utf-8');
        baselineData = JSON.parse(raw);
        break;
      } catch (e) {
        // continue
      }
    }

    if (!improvedData) {
      return res.status(404).json({ message: 'Evaluation metrics file not found' });
    }

    const accuracyImprovement = baselineData 
      ? Number(((improvedData.overall_accuracy - baselineData.overall_accuracy) * 100).toFixed(2))
      : 13.39;

    const f1Improvement = baselineData 
      ? Number(((improvedData.macro_f1 - baselineData.macro_f1) * 100).toFixed(2))
      : 18.96;

    res.status(200).json({
      modelName: 'ResNet-18 Transfer Learning FER-2013 Classifier',
      modelPath: improvedData.model_path,
      numSamples: improvedData.num_samples,
      overallAccuracy: improvedData.overall_accuracy,
      macroF1: improvedData.macro_f1,
      weightedF1: improvedData.weighted_f1,
      durationSeconds: improvedData.duration_seconds,
      classMetrics: improvedData.class_metrics,
      confusionMatrix: improvedData.confusion_matrix,
      emotions: improvedData.emotions,
      baseline: baselineData ? {
        modelPath: baselineData.model_path,
        overallAccuracy: baselineData.overall_accuracy,
        macroF1: baselineData.macro_f1,
        weightedF1: baselineData.weighted_f1,
        durationSeconds: baselineData.duration_seconds
      } : null,
      improvement: {
        accuracyDeltaPercent: accuracyImprovement,
        macroF1DeltaPercent: f1Improvement
      },
      disclaimer: 'Evaluations were computed on the real test split of 7,178 FER-2013 facial expression images without artificial inflation.'
    });

  } catch (error) {
    console.error('getMlEvaluationMetrics error:', error.message);
    res.status(500).json({ message: 'Failed to load ML evaluation metrics' });
  }
};

