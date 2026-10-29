import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import transforms, models, datasets
from torch.utils.data import DataLoader, Subset
import numpy as np
import os
import json
import argparse
import time
import random

EMOTIONS = ['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral']

def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

class FER2013FolderDataset(datasets.ImageFolder):
    def find_classes(self, directory):
        class_to_idx = {cls_name: idx for idx, cls_name in enumerate(EMOTIONS)}
        return EMOTIONS, class_to_idx

class CustomSubset(torch.utils.data.Dataset):
    def __init__(self, subset, transform=None):
        self.subset = subset
        self.transform = transform

    def __getitem__(self, idx):
        x, y = self.subset[idx]
        if self.transform:
            x = self.transform(x)
        return x, y

    def __len__(self):
        return len(self.subset)

def build_model(pretrained=True, num_classes=len(EMOTIONS), freeze_early=False):
    weights = models.ResNet18_Weights.IMAGENET1K_V1 if pretrained else None
    model = models.resnet18(weights=weights)
    in_features = model.fc.in_features
    model.fc = nn.Linear(in_features, num_classes)

    if freeze_early:
        # Freeze conv1, bn1, layer1, layer2
        for name, param in model.named_parameters():
            if 'fc' not in name and 'layer4' not in name and 'layer3' not in name:
                param.requires_grad = False

    return model

def compute_class_weights(targets, num_classes=len(EMOTIONS), smooth_power=0.5):
    counts = np.bincount(targets, minlength=num_classes)
    total = len(targets)
    # Smoothed inverse class frequency
    weights = (total / (num_classes * np.maximum(counts, 1))) ** smooth_power
    weights = weights / np.mean(weights) # normalize so mean is 1.0
    return torch.tensor(weights, dtype=torch.float32)

def evaluate_loader(model, loader, device, criterion=None, log_per_class=False):
    model.eval()
    val_loss = 0.0
    correct = 0
    total = 0
    all_preds = []
    all_labels = []

    with torch.no_grad():
        for inputs, labels in loader:
            inputs, labels = inputs.to(device), labels.to(device)
            outputs = model(inputs)
            if criterion:
                loss = criterion(outputs, labels)
                val_loss += loss.item() * inputs.size(0)

            _, preds = torch.max(outputs, 1)
            total += labels.size(0)
            correct += (preds == labels).sum().item()

            all_preds.extend(preds.cpu().numpy())
            all_labels.extend(labels.cpu().numpy())

    acc = correct / total if total > 0 else 0.0
    avg_loss = val_loss / total if total > 0 else 0.0

    # Macro F1 & per-class metrics
    all_preds = np.array(all_preds)
    all_labels = np.array(all_labels)
    f1_list = []
    class_metrics = {}
    for k in range(len(EMOTIONS)):
        tp = np.sum((all_preds == k) & (all_labels == k))
        fp = np.sum((all_preds == k) & (all_labels != k))
        fn = np.sum((all_preds != k) & (all_labels == k))
        support = np.sum(all_labels == k)
        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0.0
        f1_list.append(f1)
        class_metrics[EMOTIONS[k]] = {
            'precision': float(prec),
            'recall': float(rec),
            'f1': float(f1),
            'support': int(support)
        }
    macro_f1 = float(np.mean(f1_list))

    if log_per_class:
        print("  Per-Class Validation Metrics:")
        print(f"    {'Class':<10} | {'Support':<8} | {'Precision':<10} | {'Recall':<10} | {'F1-Score':<10}")
        print("    " + "-" * 56)
        for emo in EMOTIONS:
            cm = class_metrics[emo]
            print(f"    {emo:<10} | {cm['support']:<8} | {cm['precision']*100:>8.2f}% | {cm['recall']*100:>8.2f}% | {cm['f1']*100:>8.2f}%")

    return acc, macro_f1, avg_loss, class_metrics

def run_experiment(args):
    set_seed(args.seed)
    torch.set_num_threads(min(12, os.cpu_count() or 4))
    device = torch.device('cuda' if torch.cuda.is_available() and args.device == 'cuda' else 'cpu')
    print("=" * 72)
    print(f"RUNNING EMOTION CLASSIFICATION EXPERIMENT: {args.exp_name}")
    print(f"Device: {device} | Pretrained: {args.pretrained} | Augmentation: {args.augment} | Class Weights: {args.class_weights}")
    print("=" * 72)

    # 1. Transforms
    if args.augment:
        train_transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomRotation(degrees=(-10, 10)),
            transforms.ColorJitter(brightness=0.2, contrast=0.2),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])
    else:
        train_transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.RandomHorizontalFlip(),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ])

    val_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    # 2. Datasets & Stratified Train/Val Split (85% train, 15% validation)
    train_dir = os.path.join(args.dataset, 'train')
    full_dataset = FER2013FolderDataset(train_dir, transform=None)
    targets = [sample[1] for sample in full_dataset.samples]

    from collections import defaultdict
    indices_per_class = defaultdict(list)
    for idx, label in enumerate(targets):
        indices_per_class[label].append(idx)

    train_indices = []
    val_indices = []
    val_ratio = 0.15

    for label, idxs in indices_per_class.items():
        random.shuffle(idxs)
        n_val = int(len(idxs) * val_ratio)
        val_indices.extend(idxs[:n_val])
        train_indices.extend(idxs[n_val:])

    train_subset = Subset(full_dataset, train_indices)
    val_subset = Subset(full_dataset, val_indices)

    train_dataset = CustomSubset(train_subset, transform=train_transform)
    val_dataset = CustomSubset(val_subset, transform=val_transform)

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False, num_workers=0)

    print(f"Dataset split: Train = {len(train_dataset):,d} images | Val = {len(val_dataset):,d} images")

    # 3. Model Architecture
    model = build_model(pretrained=args.pretrained, num_classes=len(EMOTIONS), freeze_early=args.freeze_early).to(device)

    # 4. Loss Function
    if args.class_weights:
        train_targets = [targets[i] for i in train_indices]
        weights = compute_class_weights(train_targets).to(device)
        print(f"Using class weights: {[round(w, 2) for w in weights.tolist()]}")
        criterion = nn.CrossEntropyLoss(weight=weights)
    else:
        criterion = nn.CrossEntropyLoss()

    # 5. Optimizer & LR Schedulers
    if args.pretrained:
        # Differential learning rates: lower for pretrained backbone, higher for head
        backbone_params = [p for n, p in model.named_parameters() if 'fc' not in n and p.requires_grad]
        head_params = [p for n, p in model.named_parameters() if 'fc' in n and p.requires_grad]
        optimizer = optim.AdamW([
            {'params': backbone_params, 'lr': args.lr * 0.2},
            {'params': head_params, 'lr': args.lr}
        ], weight_decay=1e-4)
    else:
        trainable_params = [p for p in model.parameters() if p.requires_grad]
        optimizer = optim.AdamW(trainable_params, lr=args.lr, weight_decay=1e-4)

    if args.scheduler == 'cosine':
        scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-6)
    else:
        scheduler = None

    # 6. Training Loop with Model Checkpointing
    best_val_acc = 0.0
    best_val_macro_f1 = 0.0
    best_epoch = 0
    start_epoch = 1
    os.makedirs('models', exist_ok=True)
    checkpoint_path = f"models/{args.exp_name}.pth"
    latest_ckpt_path = f"models/{args.exp_name}_latest.pt"

    start_time = time.time()
    history = []

    # Safe Checkpoint Recovery
    if args.resume and os.path.exists(args.resume):
        print(f"Resuming training from checkpoint: {args.resume}")
        ckpt_data = torch.load(args.resume, map_location=device)
        if isinstance(ckpt_data, dict) and 'model_state_dict' in ckpt_data:
            # Complete resumable checkpoint dictionary
            model.load_state_dict(ckpt_data['model_state_dict'], strict=True)
            print("  [MODEL] Restored ResNet-18 weights from checkpoint.")
            
            if 'optimizer_state_dict' in ckpt_data and ckpt_data['optimizer_state_dict'] is not None:
                optimizer.load_state_dict(ckpt_data['optimizer_state_dict'])
                print("  [OPTIMIZER] Restored AdamW optimizer state from checkpoint.")
            else:
                print("  [OPTIMIZER: WARM-START] optimizer_state_dict is None in checkpoint.")
                print("  Initialized fresh AdamW optimizer with differential learning rates (warm-start model weights).")

            start_epoch = ckpt_data.get('epoch', 0) + 1

            if scheduler and 'scheduler_state_dict' in ckpt_data and ckpt_data['scheduler_state_dict'] is not None:
                scheduler.load_state_dict(ckpt_data['scheduler_state_dict'])
                print("  [SCHEDULER] Restored CosineAnnealingLR state from checkpoint.")
            elif scheduler and start_epoch > 1:
                # Step the cosine scheduler (start_epoch - 1) times so its learning rate aligns with resumed epoch
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore')
                    for _ in range(start_epoch - 1):
                        scheduler.step()
                print(f"  [SCHEDULER: ALIGNED] Advanced CosineAnnealingLR for resumed Epoch {start_epoch}: last_epoch={scheduler.last_epoch}")

            best_val_acc = ckpt_data.get('best_val_acc', 0.0)
            best_val_macro_f1 = ckpt_data.get('best_val_macro_f1', 0.0)
            best_epoch = ckpt_data.get('best_epoch', ckpt_data.get('epoch', 0))
            history = ckpt_data.get('history', [])
            if 'rng_state' in ckpt_data and ckpt_data['rng_state'] is not None:
                torch.set_rng_state(ckpt_data['rng_state'])
                print("  [RNG] Restored PyTorch RNG state from checkpoint.")
            print(f"  Checkpoint summary: Target Resume Epoch = {start_epoch}, Anchor Best Val Acc = {best_val_acc*100:.2f}%")
        elif isinstance(ckpt_data, dict):
            # Model weights dictionary only (state_dict)
            if any(k.startswith('resnet.') for k in ckpt_data.keys()):
                remapped = {k.replace('resnet.', ''): v for k, v in ckpt_data.items()}
                model.load_state_dict(remapped, strict=True)
            else:
                model.load_state_dict(ckpt_data, strict=True)
            print("  Recovered model weights from pure state_dict.")
            print("  [WARM-START] Optimizer/scheduler/RNG states were not saved in weights-only file. Re-initializing optimizer schedule.")
            val_acc, val_f1, _, _ = evaluate_loader(model, val_loader, device, criterion)
            best_val_acc = val_acc
            best_val_macro_f1 = val_f1
            start_epoch = 2
            best_epoch = 1
            if scheduler and start_epoch > 1:
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore')
                    for _ in range(start_epoch - 1):
                        scheduler.step()
            print(f"  Anchored baseline Val Acc: {best_val_acc*100:.2f}%, Val Macro-F1: {best_val_macro_f1*100:.2f}%. Resuming from Epoch {start_epoch}.")

    print("\nEffective Learning Rates at Start of Training:")
    for idx, grp in enumerate(optimizer.param_groups):
        grp_name = "Classification Head (fc)" if idx == 1 else "Fine-Tuning Backbone (layer3/4)"
        print(f"  Param Group {idx} ({grp_name}): LR = {grp['lr']:.8f}")

    # Step 2: Non-destructive pre-training sanity check
    if getattr(args, 'sanity_check', False):
        print("\n" + "=" * 72)
        print("PRE-TRAINING SANITY CHECK")
        print("=" * 72)
        print(f"1. Checkpoint Loaded Successfully: {args.resume}")
        print(f"2. Resumed Start Epoch: {start_epoch} (Total Target: {args.epochs} epochs)")
        print(f"3. Cosine Scheduler last_epoch: {scheduler.last_epoch if scheduler else 'None'}")
        for idx, grp in enumerate(optimizer.param_groups):
            grp_name = "Head" if idx == 1 else "Backbone"
            print(f"   Effective LR Group {idx} ({grp_name}): {grp['lr']:.8f}")

        print("4. Testing 1-batch forward & backward pass...")
        model.train()
        test_inputs, test_labels = next(iter(train_loader))
        test_inputs, test_labels = test_inputs.to(device), test_labels.to(device)
        optimizer.zero_grad()
        test_outputs = model(test_inputs)
        test_loss = criterion(test_outputs, test_labels)
        test_loss.backward()
        print(f"   Forward+Backward pass successful! Batch loss: {test_loss.item():.4f}")
        optimizer.zero_grad() # Do not step optimizer to maintain clean state

        print("5. Testing 1-batch validation pass...")
        model.eval()
        with torch.no_grad():
            v_inputs, v_labels = next(iter(val_loader))
            v_inputs, v_labels = v_inputs.to(device), v_labels.to(device)
            v_out = model(v_inputs)
            v_loss = criterion(v_out, v_labels)
            _, v_preds = torch.max(v_out, 1)
            v_correct = (v_preds == v_labels).sum().item()
        print(f"   Validation batch successful! Batch accuracy: {v_correct}/{len(v_labels)} ({v_correct*100/len(v_labels):.2f}%)")
        print("=" * 72)
        print("SANITY CHECK COMPLETE: ALL CHECKS PASSED. Ready to train.")
        print("=" * 72)
        return

    print("\nStarting training loop...")
    for epoch in range(start_epoch, args.epochs + 1):
        epoch_start = time.time()
        model.train()
        running_loss = 0.0
        train_correct = 0
        train_total = 0

        for i, (inputs, labels) in enumerate(train_loader):
            inputs, labels = inputs.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            running_loss += loss.item() * inputs.size(0)
            _, preds = torch.max(outputs, 1)
            train_total += labels.size(0)
            train_correct += (preds == labels).sum().item()

            if (i + 1) % 50 == 0 or (i + 1) == len(train_loader):
                step_loss = running_loss / train_total
                step_acc = train_correct / train_total
                print(f"  Epoch [{epoch}/{args.epochs}] Batch [{i+1}/{len(train_loader)}] Loss: {step_loss:.4f} | Train Acc: {step_acc*100:.2f}%")

        if scheduler:
            scheduler.step()

        train_loss = running_loss / train_total
        train_acc = train_correct / train_total

        # Evaluate on validation split with per-class logging
        val_acc, val_f1, val_loss, class_metrics = evaluate_loader(model, val_loader, device, criterion, log_per_class=True)
        epoch_duration = time.time() - epoch_start

        print(f"--> Epoch [{epoch}/{args.epochs}] ({epoch_duration:.1f}s) | Train Loss: {train_loss:.4f}, Train Acc: {train_acc*100:.2f}% | Val Loss: {val_loss:.4f}, Val Acc: {val_acc*100:.2f}%, Val Macro-F1: {val_f1*100:.2f}%")

        record = {
            'epoch': epoch,
            'train_loss': train_loss,
            'train_acc': train_acc,
            'val_loss': val_loss,
            'val_acc': val_acc,
            'val_f1': val_f1,
            'duration_sec': epoch_duration,
            'class_metrics': class_metrics
        }
        history.append(record)

        # Check for improvement and save best checkpoint atomically
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_val_macro_f1 = val_f1
            best_epoch = epoch
            temp_best_path = f"{checkpoint_path}.tmp"
            torch.save(model.state_dict(), temp_best_path)
            os.replace(temp_best_path, checkpoint_path)
            print(f"  *** NEW BEST MODEL SAVED! Val Acc: {best_val_acc*100:.2f}%, Macro-F1: {best_val_macro_f1*100:.2f}% to {checkpoint_path} ***")

        # Save full resumable checkpoint state after every epoch atomically
        latest_checkpoint_data = {
            'epoch': epoch,
            'best_epoch': best_epoch,
            'model_state_dict': model.state_dict(),
            'optimizer_state_dict': optimizer.state_dict(),
            'scheduler_state_dict': scheduler.state_dict() if scheduler else None,
            'best_val_acc': best_val_acc,
            'best_val_macro_f1': best_val_macro_f1,
            'history': history,
            'rng_state': torch.get_rng_state(),
            'exp_name': args.exp_name
        }
        temp_latest_path = f"{latest_ckpt_path}.tmp"
        torch.save(latest_checkpoint_data, temp_latest_path)
        os.replace(temp_latest_path, latest_ckpt_path)

    total_time = time.time() - start_time
    print("\n" + "=" * 72)
    print(f"EXPERIMENT {args.exp_name} COMPLETE")
    print(f"Total training time: {total_time/60:.2f} minutes ({total_time:.1f}s)")
    print(f"Best Epoch: {best_epoch} | Best Val Acc: {best_val_acc*100:.2f}% | Best Val Macro-F1: {best_val_macro_f1*100:.2f}%")
    print(f"Best checkpoint: {checkpoint_path}")
    print("=" * 72)

    result_summary = {
        'exp_name': args.exp_name,
        'pretrained': args.pretrained,
        'augment': args.augment,
        'class_weights': args.class_weights,
        'freeze_early': args.freeze_early,
        'epochs': args.epochs,
        'batch_size': args.batch_size,
        'lr': args.lr,
        'scheduler': args.scheduler,
        'best_epoch': best_epoch,
        'best_val_acc': best_val_acc,
        'best_val_macro_f1': best_val_macro_f1,
        'total_time_seconds': total_time,
        'checkpoint_path': checkpoint_path,
        'history': history
    }

    summary_path = f"models/{args.exp_name}_summary.json"
    with open(summary_path, 'w') as f:
        json.dump(result_summary, f, indent=4)

    return result_summary

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='FER-2013 Controlled Improvement Experiments')
    parser.add_argument('--exp-name', type=str, required=True, help='Unique experiment name')
    parser.add_argument('--dataset', type=str, default=r'D:\Downloads\archive', help='Dataset root path')
    parser.add_argument('--pretrained', action='store_true', default=True, help='Use ImageNet pretrained weights')
    parser.add_argument('--no-pretrained', dest='pretrained', action='store_false')
    parser.add_argument('--augment', action='store_true', default=True, help='Use enhanced data augmentation')
    parser.add_argument('--no-augment', dest='augment', action='store_false')
    parser.add_argument('--class-weights', action='store_true', default=True, help='Use class-weighted loss')
    parser.add_argument('--no-class-weights', dest='class_weights', action='store_false')
    parser.add_argument('--freeze-early', action='store_true', default=False, help='Freeze early ResNet layers')
    parser.add_argument('--epochs', type=int, default=5, help='Number of epochs')
    parser.add_argument('--batch-size', type=int, default=64, help='Batch size')
    parser.add_argument('--lr', type=float, default=5e-4, help='Learning rate')
    parser.add_argument('--scheduler', type=str, default='cosine', choices=['cosine', 'none'], help='LR scheduler')
    parser.add_argument('--seed', type=int, default=42, help='Random seed')
    parser.add_argument('--device', type=str, default='cuda', choices=['cuda', 'cpu'], help='Device')
    parser.add_argument('--resume', type=str, default=None, help='Path to checkpoint file to resume from')
    parser.add_argument('--sanity-check', action='store_true', help='Run 1-batch pre-training sanity check and exit')

    args = parser.parse_args()
    run_experiment(args)
