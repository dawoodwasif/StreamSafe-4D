from confluent_kafka import Consumer
from client import read_config

TOPICS = ["behavior_events", "pose_events", "machine_state"]

def main():
    config = read_config()
    config["group.id"] = "debug-group-2"      # new group to start from earliest again
    config["auto.offset.reset"] = "earliest"

    consumer = Consumer(config)
    consumer.subscribe(TOPICS)

    seen = set()
    print(f"Subscribed to: {TOPICS}")
    try:
        while len(seen) < len(TOPICS):
            msg = consumer.poll(1.0)
            if msg is None or msg.error():
                continue

            topic = msg.topic()
            key = msg.key().decode("utf-8") if msg.key() else None
            value = msg.value().decode("utf-8")

            print(f"[{topic}] key={key} value={value}")
            seen.add(topic)
    finally:
        consumer.close()
        print("Got at least one message from each topic:", seen)

if __name__ == "__main__":
    main()
