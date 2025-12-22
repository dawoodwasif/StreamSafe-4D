# streamsafed_config.py

from dataclasses import dataclass

@dataclass(frozen=True)
class BehaviorClass:
    class_id: int
    name: str
    safe_flag: int          # 1 = safe, 0 = unsafe
    behavior_type: str      # "safe" or "unsafe"
    base_risk: float        # between 0 and 1
    default_zone: str       # logical zone id

BEHAVIOR_CLASSES = {
    0: BehaviorClass(
        class_id=0,
        name="safe_walkway_violation",
        safe_flag=0,
        behavior_type="unsafe",
        base_risk=0.7,
        default_zone="zone_walkway",
    ),
    1: BehaviorClass(
        class_id=1,
        name="unauthorized_intervention",
        safe_flag=0,
        behavior_type="unsafe",
        base_risk=0.9,
        default_zone="zone_panel",
    ),
    2: BehaviorClass(
        class_id=2,
        name="opened_panel_cover",
        safe_flag=0,
        behavior_type="unsafe",
        base_risk=0.8,
        default_zone="zone_panel",
    ),
    3: BehaviorClass(
        class_id=3,
        name="carrying_overload_with_forklift",
        safe_flag=0,
        behavior_type="unsafe",
        base_risk=0.85,
        default_zone="zone_forklift_lane",
    ),
    4: BehaviorClass(
        class_id=4,
        name="safe_walkway",
        safe_flag=1,
        behavior_type="safe",
        base_risk=0.1,
        default_zone="zone_walkway",
    ),
    5: BehaviorClass(
        class_id=5,
        name="authorized_intervention",
        safe_flag=1,
        behavior_type="safe",
        base_risk=0.2,
        default_zone="zone_panel",
    ),
    6: BehaviorClass(
        class_id=6,
        name="closed_panel_cover",
        safe_flag=1,
        behavior_type="safe",
        base_risk=0.1,
        default_zone="zone_panel",
    ),
    7: BehaviorClass(
        class_id=7,
        name="safe_carrying",
        safe_flag=1,
        behavior_type="safe",
        base_risk=0.1,
        default_zone="zone_forklift_lane",
    ),
}

NAME_TO_BEHAVIOR = {bc.name: bc for bc in BEHAVIOR_CLASSES.values()}
