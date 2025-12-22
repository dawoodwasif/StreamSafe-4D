import json
from json import JSONDecodeError
from confluent_kafka import Consumer
from client import read_config  # same helper you used in debug_consumer / risk_engine

TOPIC_ALERTS = "risk_alerts"

def format_alert(alert: dict) -> str:
    worker = alert.get("worker_id")
    zone = alert.get("zone_id")
    ts = alert.get("timestamp")
    risk = alert.get("risk_score")
    behavior = alert.get("behavior_class")
    machine = alert.get("machine_state")

    risk_str = f"{risk:.3f}" if isinstance(risk, (int, float)) else str(risk)

    return (
        f"[ALERT] worker={worker} zone={zone} ts={ts} "
        f"risk={risk_str} behavior={behavior} machine={machine}"
    )

def main():
    conf = read_config()
    conf.update({
        "group.id": "risk-alert-console",
        "auto.offset.reset": "earliest",
    })

    consumer = Consumer(conf)
    consumer.subscribe([TOPIC_ALERTS])
    print(f"Subscribed to: [{TOPIC_ALERTS}]")

    try:
        while True:
            msg = consumer.poll(1.0)
            if msg is None:
                continue

            if msg.error():
                print(f"[WARN] Consumer error: {msg.error()}")
                continue

            raw_value = msg.value()
            if raw_value is None or raw_value == b"":
                continue

            try:
                alert = json.loads(raw_value.decode("utf-8"))
            except JSONDecodeError:
                print(f"[WARN] Skipping non JSON alert: {raw_value!r}")
                continue

            print(format_alert(alert))

    except KeyboardInterrupt:
        pass
    finally:
        consumer.close()
        print("Alert console stopped.")

if __name__ == "__main__":
    main()
