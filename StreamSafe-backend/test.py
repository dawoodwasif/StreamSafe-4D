import pandas as pd
from pathlib import Path

csv_path = Path(r"Safe-and-Unsafe-Behaviours-Dataset\annotations.csv")
df = pd.read_csv(csv_path)

print(df.head())
print(df["class_name"].value_counts())
print(df.groupby(["class_name", "safe_flag"])["video_id"].count())
