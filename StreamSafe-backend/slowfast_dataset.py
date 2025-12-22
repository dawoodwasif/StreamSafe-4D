import os
import random
from pathlib import Path

import pandas as pd
import torch
from torch.utils.data import Dataset

from pytorchvideo.data.encoded_video import EncodedVideo
from pytorchvideo.transforms import (
    ApplyTransformToKey,
    UniformTemporalSubsample,
    ShortSideScale,
)
from torchvision.transforms import Compose, Lambda
from torchvision.transforms._transforms_video import (
    CenterCropVideo,
    NormalizeVideo,
)


class PackPathway(torch.nn.Module):
    """
    Turn a single video clip into SlowFast pathways.
    Input shape: (C, T, H, W)
    Output: [slow_pathway, fast_pathway]
    """
    def __init__(self, alpha: int = 4):
        super().__init__()
        self.alpha = alpha

    def forward(self, frames: torch.Tensor):
        # Fast pathway is full frame rate
        fast_pathway = frames

        # Slow pathway is temporally subsampled
        num_fast_frames = frames.shape[1]
        num_slow_frames = num_fast_frames // self.alpha

        idxs = torch.linspace(
            0, num_fast_frames - 1, num_slow_frames
        ).long()

        slow_pathway = torch.index_select(frames, 1, idxs)

        return [slow_pathway, fast_pathway]


def create_slowfast_transform(
    num_frames: int = 32,
    side_size: int = 256,
    crop_size: int = 256,
    alpha: int = 4,
):
    """
    Returns a transform that:
    - Uniformly samples `num_frames` from clip
    - Normalizes to Kinetics mean/std
    - Scales short side and center crops
    - Packs into SlowFast pathways
    """
    mean = [0.45, 0.45, 0.45]
    std = [0.225, 0.225, 0.225]

    transform = ApplyTransformToKey(
        key="video",
        transform=Compose(
            [
                # [C, T, H, W] -> uniformly subsampled along T
                UniformTemporalSubsample(num_frames),
                # uint8 [0,255] -> float32 [0,1]
                Lambda(lambda x: x.float() / 255.0),
                NormalizeVideo(mean, std),
                ShortSideScale(size=side_size),
                CenterCropVideo(crop_size),
                PackPathway(alpha=alpha),
            ]
        ),
    )
    return transform


class SafeWarehouseDataset(Dataset):
    """
    Uses your annotations.csv with columns:
    split, video_id, filepath, class_id, class_name, safe_flag
    """

    def __init__(
        self,
        annotations_csv: str,
        split: str,
        data_root: str = ".",
        clip_duration: float = 2.56,
        transform=None,
    ):
        self.root = Path(data_root)
        df = pd.read_csv(annotations_csv)

        if split not in df["split"].unique():
            raise ValueError(
                f"Split '{split}' not found in annotations.csv. "
                f"Available splits: {df['split'].unique()}"
            )

        self.df = df[df["split"] == split].reset_index(drop=True)
        self.clip_duration = float(clip_duration)
        self.transform = transform

    def __len__(self):
        return len(self.df)

    def _load_clip(self, video_path: Path):
        video = EncodedVideo.from_path(str(video_path))

        duration = float(video.duration)

        # Random clip for train, full clip if too short
        if duration <= self.clip_duration:
            start_sec = 0.0
        else:
            max_start = duration - self.clip_duration
            start_sec = random.uniform(0.0, max_start)

        end_sec = start_sec + self.clip_duration

        video_data = video.get_clip(start_sec=start_sec, end_sec=end_sec)
        return video_data

    def __getitem__(self, idx):
        row = self.df.iloc[idx]

        # Make path portable across OS
        video_rel = Path(row["filepath"])
        video_path = (self.root / video_rel).resolve()

        if not video_path.exists():
            raise FileNotFoundError(f"Video not found: {video_path}")

        video_data = self._load_clip(video_path)

        if self.transform is not None:
            video_data = self.transform(video_data)

        # video_data["video"] is [slow_pathway, fast_pathway]
        inputs = video_data["video"]
        label = int(row["class_id"])

        return inputs, label
