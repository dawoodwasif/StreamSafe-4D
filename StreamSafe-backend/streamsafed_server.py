import argparse
import json
import random
import time
import warnings
import threading
from collections import deque
from datetime import datetime, timezone, timedelta
from pathlib import Path

warnings.filterwarnings("ignore")

import cv2
import numpy as np
import pandas as pd
import torch
from confluent_kafka import Producer
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from ultralytics import YOLO  # pip install ultralytics
import uvicorn

from slowfast_dataset import SafeWarehouseDataset, create_slowfast_transform
from slowfast_model import create_slowfast_model  # or inline from your code
from client import read_config
from streamsafed_config import NAME_TO_BEHAVIOR  # mapping: class_name -> BehaviorConfig


# ============================================================
# Paths and constants
# ============================================================

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


# ============================================================
# SlowFast helpers (load model + class metadata)
# ============================================================

def load_slowfast_model(checkpoint_path: str, device: torch.device):
    """
    Load the trained SlowFast model from checkpoint.
    """
    ckpt = torch.load(checkpoint_path, map_location=device)
    num_classes = ckpt["num_classes"]

    model = create_slowfast_model(
        num_classes=num_classes,
        pretrained=False,       # already trained
        freeze_backbone=False,  # no effect at inference
    ).to(device)

    model.load_state_dict(ckpt["model_state"])
    model.eval()
    return model, num_classes


def load_class_id_to_name_and_meta(annotations_csv: str, data_root: str = "."):
    """
    Build:
      - class_id_to_name: {class_id: class_name}
      - class_name_meta: {class_name: {"class_id": id, "safe_flag": 0/1}}
    from the CSV used for training.
    """
    ds = SafeWarehouseDataset(
        annotations_csv=annotations_csv,
        split="train",
        data_root=data_root,
        transform=None,
    )
    df = ds.df  # pandas DataFrame inside dataset

    # class_id -> class_name
    if "class_name" in df.columns:
        class_id_to_name = (
            df[["class_id", "class_name"]]
            .drop_duplicates()
            .sort_values("class_id")
            .set_index("class_id")["class_name"]
            .to_dict()
        )
    else:
        unique_ids = sorted(df["class_id"].unique())
        class_id_to_name = {cid: f"class_{cid}" for cid in unique_ids}

    # class_name -> {class_id, safe_flag}
    if "class_name" in df.columns and "safe_flag" in df.columns:
        grouped = (
            df[["class_name", "class_id", "safe_flag"]]
            .drop_duplicates(subset=["class_name"])
            .set_index("class_name")
        )
        class_name_meta = {}
        for name, row in grouped.iterrows():
            class_name_meta[name] = {
                "class_id": int(row["class_id"]),
                "safe_flag": int(row["safe_flag"]),
            }
    else:
        class_name_meta = {name: {"class_id": cid, "safe_flag": 1}
                           for cid, name in class_id_to_name.items()}

    return class_id_to_name, class_name_meta


def prepare_slowfast_inputs(frames_np, transform, device):
    """
    frames_np: numpy array of shape (T, H, W, C), dtype uint8 (RGB).
    Returns: [slow_pathway, fast_pathway] each with shape (1, C, T, H, W).
    """
    if isinstance(frames_np, list):
        frames_np = np.stack(frames_np)  # (T, H, W, C)

    video = torch.from_numpy(frames_np)     # (T, H, W, C)
    video = video.permute(3, 0, 1, 2)      # (C, T, H, W)

    sample = {"video": video}
    sample = transform(sample)             # will create SlowFast pathways
    slowfast = sample["video"]             # [fast, slow]

    slowfast = [pathway.unsqueeze(0).to(device) for pathway in slowfast]
    return slowfast


# ============================================================
# Synthetic pose + machine state (from your simulator)
# ============================================================

def synthetic_pose(bc_name: str, step: int) -> dict:
    """
    Generate synthetic pose-like values depending on behavior type.
      - unsafe: closer to boundary and moving faster
      - safe: farther and slower
    """
    if (
        "violation" in bc_name.lower()
        or "unauthorized" in bc_name.lower()
        or "opened_panel_cover" in bc_name.lower()
        or "overload" in bc_name.lower()
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


# ============================================================
# Main pipeline class (video stream + Kafka events)
# ============================================================

class StreamSafePipeline:
    def __init__(
        self,
        video_folder: str,
        checkpoint_path: str,
        annotations_csv: str,
        data_root: str,
        num_frames: int = 32,
        yolo_weights: str = "yolov8s.pt",
        device: torch.device | None = None,
        inference_interval: int = 3,
    ):
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
        torch.backends.cudnn.benchmark = True
        print("Using device:", self.device)

        # SlowFast
        self.slowfast_model, num_classes = load_slowfast_model(checkpoint_path, self.device)
        self.class_id_to_name, self.class_name_meta = load_class_id_to_name_and_meta(
            annotations_csv, data_root
        )
        print("Num classes:", num_classes)
        print("Class mapping:", self.class_id_to_name)

        # Transform
        self.num_frames = num_frames
        self.transform = create_slowfast_transform(
            num_frames=num_frames,
            side_size=256,
            crop_size=256,
            alpha=4,
        )

        # YOLO detection model (person only)
        self.det_model = YOLO(yolo_weights)

        # Video list (recursive)
        folder = Path(video_folder)
        self.video_files = sorted(folder.rglob("*.mp4"))
        if not self.video_files:
            print(f"Warning: no .mp4 videos found under {folder.resolve()}")

        self.video_index = 0
        self.cap = None
        self.lock = threading.RLock()

        # State for classification
        self.clip_buffer = deque(maxlen=num_frames)
        self.last_pred_label = "N/A"
        self.last_pred_prob = 0.0

        # Performance optimization
        self.inference_interval = inference_interval
        self.frame_count = 0
        self.last_det_boxes = []

        # Default frame size
        self.width = 640
        self.height = 480

        # Time-step counter for synthetic pose/machine streams
        self.step_counter = 0

        # Kafka producer
        kafka_config = read_config()
        self.producer = Producer(kafka_config)

    # ------------- video handling -------------

    def _open_next_video(self):
        """
        Open the next video in the list. Loops forever over the folder.
        """
        if not self.video_files:
            self.cap = None
            return

        video_path = self.video_files[self.video_index]
        self.video_index = (self.video_index + 1) % len(self.video_files)

        print(f"[StreamSafePipeline] Opening video: {video_path}")
        self.cap = cv2.VideoCapture(str(video_path))
        if not self.cap.isOpened():
            print(f"[StreamSafePipeline] Failed to open {video_path}")
            self.cap = None
            return self._open_next_video()

        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or self.width
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or self.height
        self.clip_buffer.clear()

    def _read_frame(self):
        """
        Read next frame from current video. If video ends, switch to next.
        Returns BGR frame or None if no videos exist.
        """
        with self.lock:
            if not self.video_files:
                return None

            if self.cap is None:
                self._open_next_video()
                if self.cap is None:
                    return None

            try:
                ret, frame_bgr = self.cap.read()
            except Exception as e:
                print(f"[StreamSafePipeline] Error reading frame: {e}")
                ret = False

            if not ret:
                # End of this video, open a new one
                if self.cap:
                    self.cap.release()
                self.cap = None
                return self._read_frame()

            return frame_bgr

    # ------------- Kafka event emission -------------

    def _emit_stream_events(self):
        """
        Create and send behavior, pose, and machine_state events to Kafka
        based on the last SlowFast prediction.
        """
        if self.last_pred_label == "N/A":
            return

        # Map predicted label -> behavior config (NAME_TO_BEHAVIOR)
        bc = NAME_TO_BEHAVIOR.get(self.last_pred_label)
        if bc is None:
            print(f"[StreamSafePipeline] Warning: label '{self.last_pred_label}' not in NAME_TO_BEHAVIOR")
            return

        # Metadata: class_id and safe_flag from annotations
        meta = self.class_name_meta.get(self.last_pred_label, {"class_id": -1, "safe_flag": 1})
        class_id = meta["class_id"]
        safe_flag = meta["safe_flag"]

        now = datetime.now(timezone.utc)
        worker_id = f"worker_0"
        camera_id = "cam1"
        zone_id = bc.default_zone

        # 1) behavior event
        behavior_event = {
            "worker_id": worker_id,
            "timestamp": now.isoformat(),
            "camera_id": camera_id,
            "zone_id": zone_id,
            "video_id": "streamsafe_demo",
            "behavior_class": bc.name,
            "behavior_type": bc.behavior_type,
            "base_risk": bc.base_risk,
            "class_id": int(class_id),
            "safe_flag": int(safe_flag),
            "probability": float(self.last_pred_prob),
        }

        # 2) pose-like event (synthetic)
        pose_vals = synthetic_pose(bc.name, self.step_counter)
        pose_event = {
            "worker_id": worker_id,
            "timestamp": now.isoformat(),
            "camera_id": camera_id,
            "zone_id": zone_id,
            **pose_vals,
        }

        # 3) machine state event (synthetic)
        machine_vals = synthetic_machine_state(zone_id, self.step_counter)
        machine_event = {
            "timestamp": now.isoformat(),
            **machine_vals,
        }

        # Serialize
        behavior_value = json.dumps(behavior_event)
        pose_value = json.dumps(pose_event)
        machine_value = json.dumps(machine_event)

        # Produce to Kafka
        self.producer.produce(
            BEHAVIOR_TOPIC,
            key=worker_id,
            value=behavior_value,
        )
        self.producer.produce(
            POSE_TOPIC,
            key=worker_id,
            value=pose_value,
        )
        self.producer.produce(
            MACHINE_TOPIC,
            key=machine_event["machine_id"],
            value=machine_value,
        )

        # Serve callbacks
        self.producer.poll(0)

        self.step_counter += 1

    # ------------- per-frame processing -------------

    def _process_frame(self, frame_bgr):
        """
        Run YOLO + SlowFast classification on a single frame,
        return annotated frame and emit Kafka events as we go.
        """
        self.frame_count += 1

        # Store RGB frame for SlowFast
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        self.clip_buffer.append(frame_rgb)

        # Run inference only every N frames
        if self.frame_count % self.inference_interval == 0:
            # YOLO detection (person only, conf >= 0.2)
            det_res = self.det_model.predict(
                frame_bgr,
                conf=0.2,
                classes=[0],   # 0 = person
                verbose=False,
            )[0]

            # Cache boxes for rendering
            self.last_det_boxes = []
            if det_res.boxes is not None:
                for box in det_res.boxes:
                    coords = box.xyxy[0].cpu().numpy().astype(int)
                    self.last_det_boxes.append(coords)

            # SlowFast classification when we have a full clip
            if len(self.clip_buffer) == self.num_frames:
                frames_np = np.stack(list(self.clip_buffer))  # (T, H, W, 3), RGB
                inputs = prepare_slowfast_inputs(frames_np, self.transform, self.device)

                with torch.no_grad():
                    logits = self.slowfast_model(inputs)  # (1, num_classes)
                    probs = torch.softmax(logits, dim=1)[0]
                    pred_id = int(probs.argmax().item())
                    self.last_pred_prob = float(probs[pred_id].item())
                    self.last_pred_label = self.class_id_to_name.get(
                        pred_id, f"class_{pred_id}"
                    )

                # After new prediction, emit Kafka events
                self._emit_stream_events()

        # --- Visualization (happens every frame using cached results) ---
        annotated = frame_bgr.copy()

        # Draw cached YOLO boxes
        for (x1, y1, x2, y2) in self.last_det_boxes:
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)

        # Overlay prediction at top
        text = f"Behavior: {self.last_pred_label} ({self.last_pred_prob:.2f})"
        cv2.rectangle(annotated, (0, 0), (self.width, 50), (0, 0, 0), thickness=-1)
        cv2.putText(
            annotated,
            text,
            (15, 35),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.0,
            (0, 255, 0),
            2,
            cv2.LINE_AA,
        )

        return annotated

    # ------------- streaming generator -------------

    def frame_generator(self):
        """
        Infinite generator that yields JPEG-encoded frames in MJPEG format.
        """
        while True:
            frame_bgr = self._read_frame()
            if frame_bgr is None:
                # No videos in folder; send a black frame with message
                blank = np.zeros((self.height, self.width, 3), dtype=np.uint8)
                cv2.putText(
                    blank,
                    "No .mp4 videos found",
                    (30, self.height // 2),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1.0,
                    (0, 0, 255),
                    2,
                    cv2.LINE_AA,
                )
                frame = blank
                time.sleep(0.1)
            else:
                frame = self._process_frame(frame_bgr)

            ok, buffer = cv2.imencode(".jpg", frame)
            if not ok:
                continue

            jpg_bytes = buffer.tobytes()

            # MJPEG frame format
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + jpg_bytes + b"\r\n"
            )

    def __del__(self):
        try:
            print("Flushing Kafka producer...")
            self.producer.flush(5)
        except Exception:
            pass


# ============================================================
# FastAPI app
# ============================================================

def create_app(pipeline: StreamSafePipeline) -> FastAPI:
    app = FastAPI()

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/stream")
    def stream():
        """
        MJPEG stream endpoint.
        """
        return StreamingResponse(
            pipeline.frame_generator(),
            media_type="multipart/x-mixed-replace; boundary=frame",
        )

    return app


# ============================================================
# Entry point
# ============================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--video-folder",
        type=str,
        required=True,
        help="Folder containing videos. All *.mp4 (recursively) will be streamed in a loop.",
    )
    parser.add_argument(
        "--checkpoint",
        type=str,
        default="slowfast_streamsafe.pt",
        help="Path to trained SlowFast checkpoint",
    )
    parser.add_argument(
        "--annotations",
        type=str,
        default=str(ANNOTATIONS_PATH),
        help="Path to annotations CSV used in training",
    )
    parser.add_argument(
        "--data-root",
        type=str,
        default=str(DATASET_DIR),
        help="Root path where video files in CSV are located",
    )
    parser.add_argument(
        "--num-frames",
        type=int,
        default=32,
        help="Number of frames per SlowFast clip",
    )
    parser.add_argument(
        "--yolo-weights",
        type=str,
        default="yolov8s.pt",
        help="YOLO weights file (e.g. yolov8n.pt, yolov8s.pt, yolov8l.pt)",
    )
    parser.add_argument(
        "--inference-interval",
        type=int,
        default=3,
        help="Run inference every N frames to improve performance (default: 3)",
    )
    parser.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="Host to bind the API",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8823,
        help="Port to expose the video stream",
    )
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    pipeline = StreamSafePipeline(
        video_folder=args.video_folder,
        checkpoint_path=args.checkpoint,
        annotations_csv=args.annotations,
        data_root=args.data_root,
        num_frames=args.num_frames,
        yolo_weights=args.yolo_weights,
        device=device,
        inference_interval=args.inference_interval,
    )

    app = create_app(pipeline)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
