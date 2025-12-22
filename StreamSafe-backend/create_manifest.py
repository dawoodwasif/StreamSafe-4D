import csv
from pathlib import Path

# Adjust to your path
DATA_ROOT = Path("Safe-and-Unsafe-Behaviours-Dataset")

CLASS_ID_TO_CANONICAL = {
    0: "safe_walkway_violation",
    1: "unauthorized_intervention",
    2: "opened_panel_cover",          # normalize the space in folder name
    3: "carrying_overload_with_forklift",
    4: "safe_walkway",
    5: "authorized_intervention",
    6: "closed_panel_cover",
    7: "safe_carrying",
}

SAFE_CLASS_NAMES = {
    "safe_walkway",
    "authorized_intervention",
    "closed_panel_cover",
    "safe_carrying",
}


def canonical_from_folder(folder_name: str) -> tuple[int, str]:
    """
    folder_name examples:
      '0_safe_walkway_violation'
      '2_opened_panel cover'  (note the space)
    Returns (class_id, canonical_name)
    """
    # split only on the first underscore
    first_underscore = folder_name.find("_")
    if first_underscore == -1:
        raise ValueError(f"Unexpected folder name, no underscore: {folder_name}")

    class_id_str = folder_name[:first_underscore]
    rest = folder_name[first_underscore + 1 :]  # everything after first underscore

    class_id = int(class_id_str)

    # Normalize: replace spaces with underscores
    normalized = rest.replace(" ", "_")

    # Optionally cross check with our mapping
    if class_id in CLASS_ID_TO_CANONICAL:
        canonical = CLASS_ID_TO_CANONICAL[class_id]
    else:
        canonical = normalized

    return class_id, canonical


def build_manifest():
    rows = []
    for split in ["train", "test"]:
        split_dir = DATA_ROOT / split
        if not split_dir.exists():
            raise FileNotFoundError(f"Split directory not found: {split_dir}")

        for class_dir in sorted(split_dir.iterdir()):
            if not class_dir.is_dir():
                continue

            class_id, class_name = canonical_from_folder(class_dir.name)
            safe_flag = 1 if class_name in SAFE_CLASS_NAMES else 0

            for video_path in sorted(class_dir.glob("*.mp4")):
                video_id = video_path.stem  # filename without extension
                rows.append(
                    {
                        "split": split,
                        "video_id": video_id,
                        "filepath": str(video_path),
                        "class_id": class_id,
                        "class_name": class_name,
                        "safe_flag": safe_flag,
                    }
                )

    out_path = DATA_ROOT / "annotations.csv"
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "split",
                "video_id",
                "filepath",
                "class_id",
                "class_name",
                "safe_flag",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {out_path}")


if __name__ == "__main__":
    build_manifest()
