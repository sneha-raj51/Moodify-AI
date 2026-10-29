import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import transforms, models, datasets
from torch.utils.data import DataLoader, Dataset
import os
import pandas as pd
from PIL import Image
import numpy as np
import argparse
import json
import random
import time

# Canonical FER2013 label mapping
EMOTIONS = ['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral']
IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.bmp', '.ppm', '.pgm', '.tif', '.tiff', '.webp')

def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

# ResNet18 model for FER2013
class FaceEmotionModel(nn.Module):
    def __init__(self, num_classes=len(EMOTIONS)):
        super(FaceEmotionModel, self).__init__()
        self.resnet = models.resnet18(weights=None)
        # FER2013 images are 48x48 grayscale, but we preprocess to 224x224 RGB
        self.resnet.fc = nn.Linear(self.resnet.fc.in_features, num_classes)
        
    def forward(self, x):
        return self.resnet(x)

# Custom Dataset for folder-based FER2013 dataset (e.g. archive/train and archive/test)
class FER2013FolderDataset(datasets.ImageFolder):
    """
    Dataset for folder-based FER-2013 images.
    Enforces canonical emotion label mapping matching main.py:
    0: angry, 1: disgust, 2: fear, 3: happy, 4: sad, 5: surprise, 6: neutral.
    Images are loaded as RGB 3-channel PIL Images.
    """
    def find_classes(self, directory):
        # Strict mapping to ensure alphabetical folder order doesn't shift class indices
        class_to_idx = {cls_name: idx for idx, cls_name in enumerate(EMOTIONS)}
        return EMOTIONS, class_to_idx

# Legacy Dataset for FER2013 CSV format (kept for backwards compatibility and tests)
class FER2013Dataset(Dataset):
    def __init__(self, csv_file, split='Training', transform=None):
        """
        Expects fer2013.csv from Kaggle.
        Columns: emotion, pixels, Usage
        """
        self.data = pd.read_csv(csv_file)
        
        # Validate columns
        required_cols = {'emotion', 'pixels', 'Usage'}
        if not required_cols.issubset(self.data.columns):
            raise ValueError(f"Dataset missing required columns. Expected {required_cols}")
            
        self.data = self.data[self.data['Usage'] == split]
        self.transform = transform
        
    def __len__(self):
        return len(self.data)
        
    def __getitem__(self, idx):
        row = self.data.iloc[idx]
        emotion = int(row['emotion'])
        try:
            pixels = np.array(row['pixels'].split(), dtype='uint8').reshape(48, 48)
        except Exception:
            # Handle malformed rows
            pixels = np.zeros((48, 48), dtype='uint8')
        
        # Convert grayscale 48x48 to RGB 48x48
        image = Image.fromarray(pixels).convert('RGB')
        
        if self.transform:
            image = self.transform(image)
            
        return image, emotion

def validate_dataset_folder(dataset_path=None, train_dir=None, test_dir=None):
    """
    Validates folder existence, the seven canonical emotion classes,
    and image counts across train and test directories without mixing splits.
    """
    if train_dir is None:
        if dataset_path is None:
            raise ValueError("Either --dataset or --train-dir must be provided.")
        train_dir = os.path.join(dataset_path, 'train')
        
    if test_dir is None:
        if dataset_path is None:
            raise ValueError("Either --dataset or --test-dir must be provided.")
        test_dir = os.path.join(dataset_path, 'test')

    if not os.path.isdir(train_dir):
        raise FileNotFoundError(f"Training directory not found at: {train_dir}")
    if not os.path.isdir(test_dir):
        raise FileNotFoundError(f"Evaluation/test directory not found at: {test_dir}")

    # Validate classes and count images
    train_counts = {}
    test_counts = {}

    for split_name, split_path, counts_dict in [('train', train_dir, train_counts), ('test', test_dir, test_counts)]:
        for emo in EMOTIONS:
            emo_dir = os.path.join(split_path, emo)
            if not os.path.isdir(emo_dir):
                raise ValueError(
                    f"Dataset validation failed: missing class folder '{emo}' in {split_name} directory ({split_path}).\n"
                    f"Expected classes: {EMOTIONS}"
                )
            
            # Count image files
            files = [
                f for f in os.listdir(emo_dir)
                if os.path.isfile(os.path.join(emo_dir, f)) and f.lower().endswith(IMAGE_EXTENSIONS)
            ]
            count = len(files)
            if count == 0:
                raise ValueError(
                    f"Dataset validation failed: class folder '{emo}' in {split_name} ({emo_dir}) has 0 valid image files."
                )
            counts_dict[emo] = count

    total_train = sum(train_counts.values())
    total_test = sum(test_counts.values())

    print("=" * 72)
    print("FER-2013 IMAGE FOLDER DATASET VALIDATION SUCCESSFUL")
    print("=" * 72)
    print(f"Train folder : {train_dir}")
    print(f"Test folder  : {test_dir}")
    print("-" * 72)
    print(f"{'Idx':<4} | {'Class Name':<12} | {'Train Images':<14} | {'Test Images':<13} | {'Total':<10}")
    print("-" * 72)
    for idx, emo in enumerate(EMOTIONS):
        tr_c = train_counts[emo]
        te_c = test_counts[emo]
        tot_c = tr_c + te_c
        print(f"{idx:<4} | {emo:<12} | {tr_c:<14,d} | {te_c:<13,d} | {tot_c:<10,d}")
    print("-" * 72)
    print(f"{'ALL':<4} | {len(EMOTIONS)} classes   | {total_train:<14,d} | {total_test:<13,d} | {total_train + total_test:<10,d}")
    print("=" * 72)

    return train_dir, test_dir, train_counts, test_counts

def train_model(args):
    set_seed(args.seed)
    
    # Preprocessing transforms (Identical to existing training & main.py inference)
    transform_train = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    
    transform_val = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    
    # Determine whether folder-based dataset or CSV dataset is provided
    is_folder_dataset = (
        args.train_dir is not None
        or (args.dataset and os.path.isdir(args.dataset))
    )

    if is_folder_dataset:
        print("Validating folder-based dataset...")
        try:
            train_dir, test_dir, _, _ = validate_dataset_folder(
                dataset_path=args.dataset,
                train_dir=args.train_dir,
                test_dir=args.test_dir
            )
        except Exception as e:
            print(f"Validation Error: {e}")
            return

        if args.validate_only:
            print("Validation-only flag set. Skipping training execution.")
            return

        print("Loading folder datasets...")
        train_dataset = FER2013FolderDataset(train_dir, transform=transform_train)
        val_dataset = FER2013FolderDataset(test_dir, transform=transform_val)
    else:
        csv_path = args.dataset
        if not os.path.exists(csv_path):
            print(f"Dataset not found at {csv_path}.")
            print("Please specify a valid folder path (containing 'train' and 'test') or a fer2013.csv file.")
            return
            
        print("Loading CSV datasets...")
        try:
            train_dataset = FER2013Dataset(csv_path, split='Training', transform=transform_train)
            val_dataset = FER2013Dataset(csv_path, split='PublicTest', transform=transform_val)
        except Exception as e:
            print(f"Failed to load CSV dataset: {e}")
            return

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False, num_workers=0)
    
    if args.device == 'cuda' and not torch.cuda.is_available():
        print("CUDA not available. Falling back to CPU.")
        device = torch.device('cpu')
    else:
        device = torch.device(args.device)
        
    print(f"Using device: {device}")
    
    model = FaceEmotionModel(num_classes=len(EMOTIONS)).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=args.lr)
    
    print("Starting training...")
    start_time = time.time()
    val_acc = 0.0
    for epoch in range(args.epochs):
        epoch_start = time.time()
        model.train()
        running_loss = 0.0
        
        for i, (inputs, labels) in enumerate(train_loader):
            inputs, labels = inputs.to(device), labels.to(device)
            
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            
            running_loss += loss.item()
            
            if i % 100 == 99:
                print(f"Epoch [{epoch+1}/{args.epochs}], Step [{i+1}/{len(train_loader)}], Loss: {running_loss/100:.4f}")
                running_loss = 0.0
                
        # Evaluation / Validation using test set
        model.eval()
        val_loss = 0.0
        correct = 0
        total = 0
        class_correct = [0]*len(EMOTIONS)
        class_total = [0]*len(EMOTIONS)
        
        with torch.no_grad():
            for inputs, labels in val_loader:
                inputs, labels = inputs.to(device), labels.to(device)
                outputs = model(inputs)
                loss = criterion(outputs, labels)
                val_loss += loss.item()
                
                _, predicted = torch.max(outputs.data, 1)
                total += labels.size(0)
                correct += (predicted == labels).sum().item()
                
                c = (predicted == labels).squeeze()
                for j in range(len(labels)):
                    label = labels[j].item()
                    if label < len(EMOTIONS):
                        class_correct[label] += c[j].item() if c.dim() > 0 else c.item()
                        class_total[label] += 1
                        
        val_acc = 100 * correct / total if total > 0 else 0.0
        epoch_duration = time.time() - epoch_start
        print(f"Epoch [{epoch+1}/{args.epochs}] Completed in {epoch_duration/60:.2f} min ({epoch_duration:.1f}s) | Val Loss: {val_loss/len(val_loader):.4f}, Accuracy: {val_acc:.2f}%")
        
        # Per-class metrics
        print("Per-class accuracy:")
        for k in range(len(EMOTIONS)):
            if class_total[k] > 0:
                print(f"  {EMOTIONS[k]}: {100 * class_correct[k] / class_total[k]:.2f}%")
            else:
                print(f"  {EMOTIONS[k]}: N/A")

    total_duration = time.time() - start_time
    print(f"Total training duration: {total_duration/60:.2f} minutes ({total_duration:.1f} seconds)")
                
    os.makedirs('models', exist_ok=True)
    model_path = 'models/fer2013_resnet18.pth'
    torch.save(model.state_dict(), model_path)
    
    # Save metadata
    metadata = {
        'architecture': 'ResNet18',
        'input_size': [224, 224],
        'emotions': EMOTIONS,
        'epochs_trained': args.epochs,
        'val_accuracy': val_acc
    }
    with open('models/fer2013_metadata.json', 'w') as f:
        json.dump(metadata, f, indent=4)
        
    print(f"Training complete. Model saved to {model_path}")
    print("NOTE: FER2013 accuracy measures dataset classification performance and does not establish a person's true emotional state.")

if __name__ == '__main__':
    default_dataset = r'D:\Downloads\archive' if os.path.exists(r'D:\Downloads\archive') else 'data/fer2013.csv'
    
    parser = argparse.ArgumentParser(description='Train FER2013 Emotion Classifier')
    parser.add_argument('--dataset', type=str, default=default_dataset, help='Path to dataset directory (with train/ and test/) or fer2013.csv')
    parser.add_argument('--train-dir', type=str, default=None, help='Explicit path to train directory (overrides dataset/train)')
    parser.add_argument('--test-dir', type=str, default=None, help='Explicit path to test directory (overrides dataset/test)')
    parser.add_argument('--validate-only', action='store_true', help='Validate dataset structure, classes, and image counts without training')
    parser.add_argument('--epochs', type=int, default=10, help='Number of epochs to train')
    parser.add_argument('--batch-size', type=int, default=64, help='Batch size')
    parser.add_argument('--lr', type=float, default=0.001, help='Learning rate')
    parser.add_argument('--seed', type=int, default=42, help='Random seed')
    parser.add_argument('--device', type=str, default='cuda', choices=['cuda', 'cpu'], help='Device to use')
    
    args = parser.parse_args()
    train_model(args)

