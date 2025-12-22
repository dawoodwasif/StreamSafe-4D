import argparse
from collections import deque
from pathlib import Path
import time
import warnings

warnings.filterwarnings("ignore")

import cv2
import numpy as np
import torch
from ultralytics import YOLO  # pip install ultralytics
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import uvicorn

from slowfast_dataset import SafeWarehouseDataset, create_slowfast_transform


# slowfast_model.py

import torch
import torch.nn as nn


def create_slowfast_model(
    num_classes: int,
    pretrained: bool = True,
    freeze_backbone: bool = True,
):
    """
    Create a SlowFast R50 model from pytorchvideo and adapt the classifier head.

    - Uses the local torch.hub cache first (no GitHub call).
    - Falls back to online hub only if local cache is missing.
    """
    # 1) Try local cache (no network call)
    try:
        model = torch.hub.load(
            "facebookresearch/pytorchvideo",
            "slowfast_r50",
            pretrained=pretrained,
            source="local",  # <- key line: only read from local hub cache
        )
    except Exception as e:
        print("[SlowFast] Local hub load failed, trying online hub:", repr(e))
        # 2) Fallback: online call (only works if you actually have internet)
        model = torch.hub.load(
            "facebookresearch/pytorchvideo",
            "slowfast_r50",
            pretrained=pretrained,
        )

    # 3) Replace classification head with num_classes
    #    PytorchVideo SlowFast has the final Linear at blocks[-1].proj
    if hasattr(model.blocks[-1], "proj"):
        in_dim = model.blocks[-1].proj.in_features
        model.blocks[-1].proj = nn.Linear(in_dim, num_classes)
    else:
        raise RuntimeError(
            "Unexpected SlowFast head structure: blocks[-1] has no 'proj' attribute"
        )

    # 4) Optionally freeze backbone and train only the last block
    if freeze_backbone:
        # freeze everything
        for p in model.parameters():
            p.requires_grad = False
        # unfreeze the head block
        for p in model.blocks[-1].parameters():
            p.requires_grad = True

    return model



# ---------------------------------------------------------
# SlowFast utilities
# ---------------------------------------------------------

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


def load_class_id_to_name(annotations_csv: str, data_root: str = "."):
    """
    Build {class_id: class_name} mapping from the CSV used for training.
    """
    ds = SafeWarehouseDataset(
        annotations_csv=annotations_csv,
        split="train",
        data_root=data_root,
        transform=None,
    )

    df = ds.df  # pandas DataFrame inside dataset
    if "class_name" in df.columns:
        mapping = (
            df[["class_id", "class_name"]]
            .drop_duplicates()
            .sort_values("class_id")
            .set_index("class_id")["class_name"]
            .to_dict()
        )
    else:
        unique_ids = sorted(df["class_id"].unique())
        mapping = {cid: f"class_{cid}" for cid in unique_ids}
    return mapping


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


# ---------------------------------------------------------
# Pipeline class that loops through all videos
# ---------------------------------------------------------

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
        self.class_id_to_name = load_class_id_to_name(annotations_csv, data_root)
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

    def _open_next_video(self):
        """
        Open the next video in the list. Loops forever over the folder.
        """
        if not self.video_files:
            # Nothing to open
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
        if not self.video_files:
            return None

        if self.cap is None:
            self._open_next_video()
            if self.cap is None:
                return None

        ret, frame_bgr = self.cap.read()
        if not ret:
            # End of this video, open a new one
            self.cap.release()
            self.cap = None
            return self._read_frame()

        return frame_bgr

    def _process_frame(self, frame_bgr):
        """
        Run YOLO + SlowFast classification on a single frame and return annotated frame.
        """
        self.frame_count += 1
        
        # Store RGB frame for SlowFast
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        self.clip_buffer.append(frame_rgb)

        # Run inference only every N frames to improve performance
        if self.frame_count % self.inference_interval == 0:
            # YOLO detection (person only, conf >= 0.2)
            det_res = self.det_model.predict(
                frame_bgr,
                conf=0.2,
                classes=[0],   # 0 = person
                verbose=False,
            )[0]

            # Cache boxes for rendering on subsequent frames
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

        # --- Visualization (happens every frame using cached results) ---
        annotated = frame_bgr.copy()

        # Draw cached YOLO boxes
        for (x1, y1, x2, y2) in self.last_det_boxes:
            cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 0), 2)
            # Optional: Add "Person" label
            # cv2.putText(annotated, "Person", (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        # Overlay prediction at top
        text = f"Behavior Detected: {self.last_pred_label} ({self.last_pred_prob:.2f})"
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


# ---------------------------------------------------------
# FastAPI app factory
# ---------------------------------------------------------

def create_app(pipeline: StreamSafePipeline) -> FastAPI:
    app = FastAPI()

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/stream")
    def stream():
        """
        MJPEG stream endpoint.
        You can consume this directly in a browser or from your Node frontend.
        """
        return StreamingResponse(
            pipeline.frame_generator(),
            media_type="multipart/x-mixed-replace; boundary=frame",
        )

    return app


# ---------------------------------------------------------
# Entry point
# ---------------------------------------------------------

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
        default="Safe-and-Unsafe-Behaviours-Dataset/annotations.csv",
        help="Path to annotations CSV used in training",
    )
    parser.add_argument(
        "--data-root",
        type=str,
        default=".",
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
