import json
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import cv2
import pandas as pd

from streamsafed_config import NAME_TO_BEHAVIOR

BASE_DIR = Path(__file__).resolve().parent
ANNOTATIONS_PATH = Path("Safe-and-Unsafe-Behaviours-Dataset") / "annotations.csv"


def get_video_duration_seconds(path: Path) -> float:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    cap.release()
    if fps <= 0:
        return 0.0
    return frame_count / fps


def resolve_video_path(raw: str) -> Path:
    p = Path(raw)
    # If CSV already stored an absolute path (like G:\...), use it directly
    if p.is_absolute():
        return p
    # Otherwise, treat it as relative to repo root
    return BASE_DIR / p


def iter_behavior_events(df: pd.DataFrame, split: str = "test"):
    """
    Yield synthetic behavior events for all videos in a split.
    For now, 1 event per second for the whole clip.
    """
    df_split = df[df["split"] == split].reset_index(drop=True)

    # simulate as if all events happen starting "now"
    start_time = datetime.now(timezone.utc)

    for idx, row in df_split.iterrows():
        class_name = row["class_name"]
        bc = NAME_TO_BEHAVIOR[class_name]

        video_path = resolve_video_path(row["filepath"])
        duration = get_video_duration_seconds(video_path)

        # fallback if duration is weird
        if duration <= 0:
            duration = 5.0

        num_steps = max(1, int(duration))  # one event per second
        worker_id = f"worker_{idx % 5}"    # 5 synthetic workers
        camera_id = "cam1"                 # single demo camera
        zone_id = bc.default_zone

        for step in range(num_steps):
            event_time = start_time + timedelta(seconds=step)
            event = {
                "worker_id": worker_id,
                "timestamp": event_time.isoformat(),
                "camera_id": camera_id,
                "zone_id": zone_id,
                "video_id": row["video_id"],
                "behavior_class": bc.name,
                "behavior_type": bc.behavior_type,
                "base_risk": bc.base_risk,
                "class_id": int(row["class_id"]),
                "safe_flag": int(row["safe_flag"]),
            }
            yield event


def main():
    df = pd.read_csv(ANNOTATIONS_PATH)

    print("Starting behavior event simulation (dry run, no Kafka yet)...")
    count = 0
    for event in iter_behavior_events(df, split="test"):
        print(json.dumps(event))
        count += 1
        time.sleep(0.1)  # ~10 events per second wall clock

        if count >= 50:
            break

    print(f"Emitted {count} behavior events (preview).")


if __name__ == "__main__":
    main()
