import json
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
import random

import cv2
import pandas as pd
from confluent_kafka import Producer

from client import read_config
from streamsafed_config import NAME_TO_BEHAVIOR

BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / "Safe-and-Unsafe-Behaviours-Dataset"
ANNOTATIONS_PATH = DATASET_DIR / "annotations.csv"

# Kafka topic names
BEHAVIOR_TOPIC = "behavior_events"
POSE_TOPIC = "pose_events"
MACHINE_TOPIC = "machine_state"

ZONE_MACHINE_ID = {
    "zone_walkway": "walkway_lane_A",
    "zone_panel": "panel_A",
    "zone_forklift_lane": "forklift_lane_A",
}


def get_video_duration_seconds(path: str) -> float:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        # fallback duration
        return 5.0
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    cap.release()
    if fps <= 0:
        return 5.0
    return frame_count / fps


def synthetic_pose(bc_name: str, step: int) -> dict:
    """
    Generate synthetic pose-like values depending on behavior type.
      - unsafe: closer to boundary and moving faster
      - safe: farther and slower
    """
    if (
        "violation" in bc_name
        or "unauthorized" in bc_name
        or "opened_panel_cover" in bc_name
        or "overload" in bc_name
    ):
        # unsafe
        distance_to_boundary = random.uniform(0.0, 0.5)
        approach_speed = random.uniform(0.8, 2.0)
    else:
        # safe
        distance_to_boundary = random.uniform(0.5, 2.0)
        approach_speed = random.uniform(0.0, 0.6)

    world_x = random.uniform(0.0, 10.0)
    world_y = random.uniform(0.0, 5.0)

    return {
        "world_x_m": world_x,
        "world_y_m": world_y,
        "distance_to_boundary_m": distance_to_boundary,
        "approach_speed_m_s": approach_speed,
    }


def synthetic_machine_state(zone_id: str, t: int) -> dict:
    """
    Simple periodic machine state pattern per zone.
    t is seconds since start.
    """
    cycle = t % 30
    if cycle < 10:
        state = "IDLE"
        speed = 0.0
    elif cycle < 20:
        state = "MOVING"
        speed = 0.5
    else:
        state = "ACTIVE_DANGER"
        speed = 1.0

    machine_id = ZONE_MACHINE_ID.get(zone_id, f"{zone_id}_machine")
    return {
        "machine_id": machine_id,
        "zone_id": zone_id,
        "state": state,
        "speed_m_s": speed,
    }


def iter_stream_events(
    df: pd.DataFrame, split: str = "test", preview_limit: int | None = 50
):
    """
    Yield triples (behavior_event, pose_event, machine_state_event)
    for a preview of the test split.
    """
    df_split = df[df["split"] == split].reset_index(drop=True)

    start_time = datetime.now(timezone.utc)
    total_count = 0

    for idx, row in df_split.iterrows():
        class_name = row["class_name"]
        bc = NAME_TO_BEHAVIOR[class_name]

        video_rel = row["filepath"]
        video_path = str(DATASET_DIR / video_rel)
        duration = get_video_duration_seconds(video_path)
        if duration <= 0:
            duration = 5.0

        num_steps = max(1, int(duration))  # 1 event per second
        worker_id = f"worker_{idx % 5}"
        camera_id = "cam1"
        zone_id = bc.default_zone

        for step in range(num_steps):
            t = step  # seconds since start of clip
            event_time = start_time + timedelta(seconds=t)

            # 1) behavior event
            behavior_event = {
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

            # 2) pose event
            pose_vals = synthetic_pose(bc.name, step)
            pose_event = {
                "worker_id": worker_id,
                "timestamp": event_time.isoformat(),
                "camera_id": camera_id,
                "zone_id": zone_id,
                **pose_vals,
            }

            # 3) machine state event
            machine_vals = synthetic_machine_state(zone_id, t)
            machine_event = {
                "timestamp": event_time.isoformat(),
                **machine_vals,
            }

            yield behavior_event, pose_event, machine_event

            total_count += 1
            if preview_limit is not None and total_count >= preview_limit:
                return


def main():
    df = pd.read_csv(ANNOTATIONS_PATH)
    config = read_config()
    producer = Producer(config)

    print(
        "Starting stream simulation (behavior + pose + machine_state, producing to Confluent)..."
    )

    for behavior_event, pose_event, machine_event in iter_stream_events(
        df, split="test", preview_limit=30
    ):
        # print to console (for debugging / demo)
        print("behavior_events:", behavior_event)
        print("pose_events:", pose_event)
        print("machine_state:", machine_event)
        print("---")

        # Serialize to JSON
        behavior_value = json.dumps(behavior_event)
        pose_value = json.dumps(pose_event)
        machine_value = json.dumps(machine_event)

        # Produce to three topics
        producer.produce(
            BEHAVIOR_TOPIC,
            key=behavior_event["worker_id"],
            value=behavior_value,
        )
        producer.produce(
            POSE_TOPIC,
            key=pose_event["worker_id"],
            value=pose_value,
        )
        producer.produce(
            MACHINE_TOPIC,
            key=machine_event["machine_id"],
            value=machine_value,
        )

        # Serve delivery callbacks and avoid growing local queue
        producer.poll(0)

        # simulate real time
        time.sleep(0.1)

    print("Flushing producer...")
    producer.flush()
    print("Preview complete.")


if __name__ == "__main__":
    main()
