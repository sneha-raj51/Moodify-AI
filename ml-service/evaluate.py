import torch
import torch.nn as nn
from torchvision import transforms, models, datasets
from torch.utils.data import DataLoader
import numpy as np
import os
import json
import argparse
import time

EMOTIONS = ['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral']

class FaceEmotionModel(nn.Module):
    def __init__(self, num_classes=len(EMOTIONS)):
        super(FaceEmotionModel, self).__init__()
        self.resnet = models.resnet18(weights=None)
        self.resnet.fc = nn.Linear(self.resnet.fc.in_features, num_classes)
        
    def forward(self, x):
        return self.resnet(x)

class FER2013FolderDataset(datasets.ImageFolder):
    def find_classes(self, directory):
        class_to_idx = {cls_name: idx for idx, cls_name in enumerate(EMOTIONS)}
        return EMOTIONS, class_to_idx

def evaluate_model(model_path, test_dir, batch_size=64, device_str='cpu', output_json=None):
    device = torch.device(device_str if (device_str == 'cuda' and torch.cuda.is_available()) else 'cpu')
    print(f"Evaluating model: {model_path}")
    print(f"Test directory:   {test_dir}")
    print(f"Device:           {device}")

    transform_val = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    test_dataset = FER2013FolderDataset(test_dir, transform=transform_val)
    test_loader = DataLoader(test_dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    num_samples = len(test_dataset)
    print(f"Loaded {num_samples} test samples across {len(EMOTIONS)} classes.")

    model = FaceEmotionModel(num_classes=len(EMOTIONS))
    checkpoint = torch.load(model_path, map_location=device, weights_only=True)
    if any(k.startswith('resnet.') for k in checkpoint.keys()):
        model.load_state_dict(checkpoint, strict=True)
    else:
        remapped = {f"resnet.{k}": v for k, v in checkpoint.items()}
        model.load_state_dict(remapped, strict=True)
    model.to(device)
    model.eval()

    all_preds = []
    all_labels = []

    start_time = time.time()
    with torch.no_grad():
        for i, (inputs, labels) in enumerate(test_loader):
            inputs = inputs.to(device)
            outputs = model(inputs)
            preds = torch.argmax(outputs, dim=1).cpu().numpy()
            all_preds.extend(preds)
            all_labels.extend(labels.numpy())
            if (i + 1) % 25 == 0 or (i + 1) == len(test_loader):
                elapsed = time.time() - start_time
                print(f"  Evaluated {len(all_preds)}/{num_samples} samples ({elapsed:.1f}s)...")

    duration = time.time() - start_time
    all_preds = np.array(all_preds)
    all_labels = np.array(all_labels)

    # Compute Confusion Matrix: rows = true, cols = predicted
    num_classes = len(EMOTIONS)
    confusion_matrix = np.zeros((num_classes, num_classes), dtype=int)
    for t, p in zip(all_labels, all_preds):
        confusion_matrix[t, p] += 1

    # Overall Accuracy
    correct_total = np.sum(all_preds == all_labels)
    accuracy = float(correct_total) / num_samples if num_samples > 0 else 0.0

    # Per-class metrics
    class_metrics = {}
    f1_list = []
    support_list = []

    for k, emo in enumerate(EMOTIONS):
        tp = int(confusion_matrix[k, k])
        fn = int(np.sum(confusion_matrix[k, :]) - tp)
        fp = int(np.sum(confusion_matrix[:, k]) - tp)
        support = int(np.sum(confusion_matrix[k, :]))

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
        acc_k = tp / support if support > 0 else 0.0

        f1_list.append(f1)
        support_list.append(support)

        class_metrics[emo] = {
            'index': k,
            'support': support,
            'true_positives': tp,
            'false_positives': fp,
            'false_negatives': fn,
            'accuracy': float(acc_k),
            'precision': float(precision),
            'recall': float(recall),
            'f1_score': float(f1)
        }

    macro_f1 = float(np.mean(f1_list))
    weighted_f1 = float(np.sum(np.array(f1_list) * np.array(support_list)) / num_samples) if num_samples > 0 else 0.0

    # Print report
    print("\n" + "=" * 78)
    print("FER-2013 HELD-OUT TEST EVALUATION REPORT")
    print("=" * 78)
    print(f"Model Checkpoint : {model_path}")
    print(f"Total Test Images: {num_samples:,d}")
    print(f"Evaluation Time  : {duration:.2f} seconds ({num_samples/duration:.1f} samples/sec)")
    print(f"Overall Accuracy : {accuracy * 100:.2f}% ({correct_total:,d}/{num_samples:,d})")
    print(f"Macro-F1 Score   : {macro_f1 * 100:.2f}%")
    print(f"Weighted-F1 Score: {weighted_f1 * 100:.2f}%")
    print("-" * 78)
    print(f"{'Idx':<4} | {'Class Name':<12} | {'Support':<8} | {'Accuracy':<10} | {'Precision':<10} | {'Recall':<10} | {'F1-Score':<10}")
    print("-" * 78)
    for emo in EMOTIONS:
        m = class_metrics[emo]
        print(f"{m['index']:<4} | {emo:<12} | {m['support']:<8,d} | {m['accuracy']*100:>7.2f}%  | {m['precision']*100:>7.2f}%  | {m['recall']*100:>7.2f}%  | {m['f1_score']*100:>7.2f}%")
    print("-" * 78)
    print(f"{'AVG':<4} | {'Macro Avg':<12} | {num_samples:<8,d} | {accuracy*100:>7.2f}%  | {'-':<10} | {'-':<10} | {macro_f1*100:>7.2f}%")
    print(f"{'AVG':<4} | {'Weighted Avg':<12} | {num_samples:<8,d} | {accuracy*100:>7.2f}%  | {'-':<10} | {'-':<10} | {weighted_f1*100:>7.2f}%")
    print("=" * 78)

    # Print Confusion Matrix
    print("\nCONFUSION MATRIX (Rows: True Labels, Columns: Predicted Labels):")
    print(f"{'True \\ Pred':<12} | " + " | ".join([f"{e[:5]:>5}" for e in EMOTIONS]))
    print("-" * 78)
    for i, emo in enumerate(EMOTIONS):
        row_str = " | ".join([f"{confusion_matrix[i, j]:>5,d}" for j in range(num_classes)])
        print(f"{emo:<12} | {row_str}")
    print("=" * 78)

    results = {
        'model_path': model_path,
        'test_dir': test_dir,
        'num_samples': num_samples,
        'overall_accuracy': accuracy,
        'macro_f1': macro_f1,
        'weighted_f1': weighted_f1,
        'duration_seconds': duration,
        'class_metrics': class_metrics,
        'confusion_matrix': confusion_matrix.tolist(),
        'emotions': EMOTIONS
    }

    if output_json:
        os.makedirs(os.path.dirname(os.path.abspath(output_json)), exist_ok=True)
        with open(output_json, 'w') as f:
            json.dump(results, f, indent=4)
        print(f"Results saved to: {output_json}")

    return results

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Evaluate FER2013 ResNet18 model')
    parser.add_argument('--model', type=str, default='models/fer2013_resnet18.pth', help='Path to model weights')
    parser.add_argument('--test-dir', type=str, default=r'D:\Downloads\archive\test', help='Path to test directory')
    parser.add_argument('--batch-size', type=int, default=64, help='Batch size for evaluation')
    parser.add_argument('--device', type=str, default='cuda', choices=['cuda', 'cpu'], help='Device')
    parser.add_argument('--output', type=str, default='models/baseline_eval.json', help='Output JSON path')
    args = parser.parse_args()

    evaluate_model(
        model_path=args.model,
        test_dir=args.test_dir,
        batch_size=args.batch_size,
        device_str=args.device,
        output_json=args.output
    )
