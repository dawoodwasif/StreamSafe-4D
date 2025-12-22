import json
import time
from json import JSONDecodeError
from collections import defaultdict
from datetime import datetime
from confluent_kafka import Consumer, Producer
from client import read_config

TOPICS_IN = ["behavior_events", "pose_events", "machine_state"]
TOPIC_ALERTS = "risk_alerts"


def make_clients():
    base_conf = read_config()

    # Producer
    producer_conf = dict(base_conf)

    # Consumer
    consumer_conf = dict(base_conf)
    consumer_conf["group.id"] = "risk-engine-group-1"
    consumer_conf["auto.offset.reset"] = "earliest"

    consumer = Consumer(consumer_conf)
    producer = Producer(producer_conf)
    return consumer, producer


def compute_risk(state: dict) -> float:
    risk = 0.0

    b = state.get("behavior")
    p = state.get("pose")
    m = state.get("machine")

    # 1) Behavior term (max ~0.7)
    if b is not None:
        base = float(b.get("base_risk", 0.0))  # assume in [0, 1]
        risk += 0.5 * base               # 0..0.5
        if b.get("behavior_type") == "unsafe":
            risk += 0.2                  # unsafe boost

    # 2) Pose term (distance + speed, max ~0.4)
    if p is not None:
        dist = float(p.get("distance_to_boundary_m", 1.0))
        speed = float(p.get("approach_speed_m_s", 0.0))

        # 0 at >= 2m away, 1 at 0m
        proximity = max(0.0, 1.0 - min(dist / 2.0, 1.0))
        # cap speed contribution at 2 m/s
        speed_norm = min(speed / 2.0, 1.0)

        risk += 0.2 * proximity
        risk += 0.2 * speed_norm

    # 3) Machine term (max ~0.3)
    if m is not None:
        ms = m.get("state")
        if ms == "ACTIVE_DANGER":
            risk += 0.3
        elif ms == "MOVING":
            risk += 0.15

    return max(0.0, min(risk, 1.0))

def risk_band(score: float) -> str:
    if score >= 0.8:
        return "CRITICAL"
    if score >= 0.5:
        return "HIGH"
    if score >= 0.3:
        return "MEDIUM"
    return "LOW"


def run():
    consumer, producer = make_clients()
    consumer.subscribe(TOPICS_IN)

    # state[(worker_id, zone_id)] = {"behavior": ..., "pose": ..., "machine": ...}
    worker_state = defaultdict(dict)
    print("Risk engine started. Listening for events...")
    try:
        while True:
            msg = consumer.poll(1.0)
            if msg is None:
                continue

            if msg.error():
                print(f"[WARN] Consumer error: {msg.error()}")
                continue

            topic = msg.topic()
            raw_value = msg.value()

            # 1) Skip null or empty payloads
            if raw_value is None or raw_value == b"":
                print(f"[DEBUG] Skipping empty message from {topic} at offset {msg.offset()}")
                continue

            try:
                value = json.loads(raw_value.decode("utf-8"))
            except JSONDecodeError:
                print(
                    f"[DEBUG] Skipping non-JSON message from {topic} at offset {msg.offset()}: "
                    f"{raw_value!r}"
                )
                continue

            key = msg.key().decode("utf-8") if msg.key() else None

            # Normal routing
            if topic == "pose_events":
                worker_id = value["worker_id"]
                zone_id = value["zone_id"]
                worker_state[(worker_id, zone_id)]["pose"] = value

            elif topic == "behavior_events":
                worker_id = value["worker_id"]
                zone_id = value["zone_id"]
                worker_state[(worker_id, zone_id)]["behavior"] = value

            elif topic == "machine_state":
                zone_id = value["zone_id"]
                for (wid, zid), s in worker_state.items():
                    if zid == zone_id:
                        s["machine"] = value

            # Compute risk only when we know the worker/zone
            if topic in ("pose_events", "behavior_events"):
                worker_id = value["worker_id"]
                zone_id = value["zone_id"]
                s = worker_state[(worker_id, zone_id)]
                risk = compute_risk(s)

                alert = {
                    "worker_id": worker_id,
                    "zone_id": zone_id,
                    "timestamp": value["timestamp"],
                    "risk_score": risk,
                    "risk_level": risk_band(risk),
                    "behavior_class": s.get("behavior", {}).get("behavior_class"),
                    "machine_state": s.get("machine", {}).get("state"),
                }

                producer.produce(
                    TOPIC_ALERTS,
                    key=f"{worker_id}:{zone_id}",
                    value=json.dumps(alert).encode("utf-8"),
                )
                print(f"[ALERT] {alert}")

            producer.poll(0)

    except KeyboardInterrupt:
        pass
    finally:
        consumer.close()
        producer.flush()
        print("Risk engine stopped.")


    


if __name__ == "__main__":
    run()
