import argparse
from collections import deque
from pathlib import Path

import warnings
warnings.filterwarnings("ignore")

import cv2
import numpy as np
import torch
from ultralytics import YOLO  # pip install ultralytics

from slowfast_dataset import SafeWarehouseDataset, create_slowfast_transform
from slowfast_model import create_slowfast_model


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
        pretrained=False,       # we already trained, just need architecture
        freeze_backbone=False,  # does not matter for inference
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
    # Ensure numpy array [T, H, W, C]
    if isinstance(frames_np, list):
        frames_np = np.stack(frames_np)

    # To torch and permute to (C, T, H, W)
    video = torch.from_numpy(frames_np)          # (T, H, W, C), uint8
    video = video.permute(3, 0, 1, 2)           # (C, T, H, W)

    # Feed dict into transform, same as in the dataset
    sample = {"video": video}
    sample = transform(sample)

    # sample["video"] is [fast_pathway, slow_pathway]
    slowfast = sample["video"]

    # Add batch dimension and move to device
    slowfast = [pathway.unsqueeze(0).to(device) for pathway in slowfast]
    return slowfast


# ---------------------------------------------------------
# Main demo logic
# ---------------------------------------------------------

def run_demo(
    video_path: str,
    checkpoint_path: str,
    annotations_csv: str,
    data_root: str,
    output_path: str,
    num_frames: int = 32,
):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    torch.backends.cudnn.benchmark = True
    print("Using device:", device)

    # 1) Load SlowFast + class mapping
    slowfast_model, num_classes = load_slowfast_model(checkpoint_path, device)
    class_id_to_name = load_class_id_to_name(annotations_csv, data_root)
    print("Num classes:", num_classes)
    print("Class mapping:", class_id_to_name)

    # 2) SlowFast transform (same settings as training)
    transform = create_slowfast_transform(
        num_frames=num_frames,
        side_size=256,
        crop_size=256,
        alpha=4,
    )

    # 3) YOLO detection model, small for speed
    #    This model has class 0 = "person"
    det_model = YOLO("yolov8l.pt")  # change to yolov8s.pt if you want a bit more accuracy

    # 4) Open video
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    out = None
    if output_path is not None:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    # 5) Frame buffer for SlowFast
    clip_buffer = deque(maxlen=num_frames)
    last_pred_label = "N/A"
    last_pred_prob = 0.0

    while True:
        ret, frame_bgr = cap.read()
        if not ret:
            break

        # Optional downscale for more speed (uncomment if needed)
        # frame_bgr = cv2.resize(frame_bgr, (width // 2, height // 2))
        # height, width = frame_bgr.shape[:2]

        # Store RGB version for SlowFast
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        clip_buffer.append(frame_rgb)

        # YOLO detection on current frame, only keep person class, conf >= 0.2
        det_res = det_model.predict(
            frame_bgr,
            conf=0.2,
            classes=[0],   # 0 = person
            verbose=False,
        )[0]

        # Annotated BGR frame with bounding boxes
        annotated = det_res.plot()

        # SlowFast classification when we have a full clip
        if len(clip_buffer) == num_frames:
            frames_np = np.stack(list(clip_buffer))  # [T, H, W, 3], RGB
            inputs = prepare_slowfast_inputs(frames_np, transform, device)

            with torch.no_grad():
                logits = slowfast_model(inputs)  # [1, num_classes]
                probs = torch.softmax(logits, dim=1)[0]
                pred_id = int(probs.argmax().item())
                last_pred_prob = float(probs[pred_id].item())
                last_pred_label = class_id_to_name.get(pred_id, f"class_{pred_id}")

        # Overlay SlowFast prediction heading on top
        text = f"Behavior Detected: {last_pred_label} ({last_pred_prob:.2f})"
        cv2.rectangle(annotated, (0, 0), (width, 50), (0, 0, 0), thickness=-1)
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

        # Write and/or show
        if out is not None:
            out.write(annotated)

        cv2.imshow("StreamSafe 4D demo", annotated)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    if out is not None:
        out.release()
    cv2.destroyAllWindows()
    print("Demo finished")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--video",
        type=str,
        required=True,
        help="Path to input video (mp4, avi, etc)",
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
        "--output",
        type=str,
        default="demo_streamsafe_output.mp4",
        help="Optional path to save the annotated video",
    )
    parser.add_argument(
        "--num-frames",
        type=int,
        default=32,
        help="Number of frames per SlowFast clip",
    )
    args = parser.parse_args()

    run_demo(
        video_path=args.video,
        checkpoint_path=args.checkpoint,
        annotations_csv=args.annotations,
        data_root=args.data_root,
        output_path=args.output,
        num_frames=args.num_frames,
    )


if __name__ == "__main__":
    main()
