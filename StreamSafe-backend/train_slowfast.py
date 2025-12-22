import argparse
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from tqdm import tqdm

from slowfast_dataset import SafeWarehouseDataset, create_slowfast_transform
from slowfast_model import create_slowfast_model

# this should be at the very top of the file
import warnings
warnings.filterwarnings("ignore")


def compute_class_weights(train_dataset):
    """
    Compute inverse-frequency class weights from train annotations.
    """
    df = train_dataset.df  # stored in dataset
    counts = df["class_id"].value_counts().sort_index()
    num_classes = counts.shape[0]

    total = counts.sum()
    weights = total / (num_classes * counts.values.astype(np.float32))

    return torch.tensor(weights, dtype=torch.float32)


def train_one_epoch(model, loader, criterion, optimizer, device):
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0

    for inputs, labels in tqdm(loader, desc="Train", leave=False):
        # inputs is [slow_batch, fast_batch]
        inputs = [x.to(device) for x in inputs]
        labels = labels.to(device)

        optimizer.zero_grad()
        outputs = model(inputs)  # shape [B, num_classes]

        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * labels.size(0)
        preds = outputs.argmax(dim=1)
        correct += (preds == labels).sum().item()
        total += labels.size(0)

    epoch_loss = running_loss / total
    epoch_acc = correct / total
    return epoch_loss, epoch_acc


@torch.no_grad()
def eval_one_epoch(model, loader, criterion, device, split_name="Val"):
    model.eval()
    running_loss = 0.0
    correct = 0
    total = 0

    for inputs, labels in tqdm(loader, desc=split_name, leave=False):
        inputs = [x.to(device) for x in inputs]
        labels = labels.to(device)

        outputs = model(inputs)
        loss = criterion(outputs, labels)

        running_loss += loss.item() * labels.size(0)
        preds = outputs.argmax(dim=1)
        correct += (preds == labels).sum().item()
        total += labels.size(0)

    epoch_loss = running_loss / total
    epoch_acc = correct / total
    return epoch_loss, epoch_acc


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--annotations", type=str, default="annotations.csv")
    parser.add_argument("--data-root", type=str, default=".")
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--num-workers", type=int, default=4)
    parser.add_argument("--save-path", type=str, default="slowfast_streamsafe.pt")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print("Using device:", device)

    # Transforms shared by train/val/test
    transform = create_slowfast_transform(
        num_frames=32,
        side_size=256,
        crop_size=256,
        alpha=4,
    )

    # Datasets
    train_ds = SafeWarehouseDataset(
        annotations_csv=args.annotations,
        split="train",
        data_root=args.data_root,
        transform=transform,
    )

    # If you have a 'val' split in CSV, use that.
    # If not, change 'val' to 'test' or create a split manually.
    val_ds = SafeWarehouseDataset(
        annotations_csv=args.annotations,
        split="test",
        data_root=args.data_root,
        transform=transform,
    )

    num_classes = train_ds.df["class_id"].nunique()
    print("Num classes:", num_classes)

    class_weights = compute_class_weights(train_ds).to(device)
    print("Class weights:", class_weights.cpu().numpy())

    criterion = nn.CrossEntropyLoss(weight=class_weights)

    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.num_workers,
        pin_memory=True,
    )

    val_loader = DataLoader(
        val_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=True,
    )

    model = create_slowfast_model(
        num_classes=num_classes,
        pretrained=True,
        freeze_backbone=True,
    ).to(device)

    optimizer = torch.optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=args.lr,
        weight_decay=args.weight_decay,
    )

    best_val_acc = 0.0
    save_path = Path(args.save_path)

    for epoch in range(1, args.epochs + 1):
        print(f"\nEpoch {epoch}/{args.epochs}")

        train_loss, train_acc = train_one_epoch(
            model, train_loader, criterion, optimizer, device
        )
        val_loss, val_acc = eval_one_epoch(
            model, val_loader, criterion, device, split_name="Val"
        )

        print(
            f"Train  loss {train_loss:.4f}  acc {train_acc:.3f} | "
            f"Val loss {val_loss:.4f}  acc {val_acc:.3f}"
        )

        # Save best model
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(
                {"model_state": model.state_dict(),
                 "num_classes": num_classes},
                save_path,
            )
            print(f"Saved best model to {save_path} (val_acc={val_acc:.3f})")

    print("Training complete. Best val acc:", best_val_acc)


if __name__ == "__main__":
    # Important for Windows multiprocessing
    main()
