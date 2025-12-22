// server/kafkaClient.ts
import { Kafka, Consumer } from "kafkajs";
import { applyIncomingAlert, KafkaConfig, state } from "./state";

let consumer: Consumer | null = null;

export async function stopKafkaConsumer() {
  if (consumer) {
    try {
      await consumer.disconnect();
    } catch (e) {
      console.error("Error disconnecting Kafka consumer", e);
    }
    consumer = null;
  }
}

export async function startKafkaConsumer(config: KafkaConfig) {
  await stopKafkaConsumer();

  const kafka = new Kafka({
    clientId: "streamsafed-dashboard",
    brokers: [config.broker],
    ssl: true,
    sasl: config.username && config.password ? {
      mechanism: "plain",
      username: config.username,
      password: config.password,
    } : undefined,
  });

  consumer = kafka.consumer({ groupId: "streamsafed-dashboard-group" });

  await consumer.connect();
  await consumer.subscribe({ topic: config.topic, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const parsed = JSON.parse(message.value.toString());

        // expected fields from Python risk_engine
        const incoming = {
          worker_id: parsed.worker_id,
          zone_id: parsed.zone_id,
          timestamp: parsed.timestamp,
          risk_score: parsed.risk_score,
          behavior_class: parsed.behavior_class,
          machine_state: parsed.machine_state,
        };

        applyIncomingAlert(incoming);
      } catch (err) {
        console.error("Error parsing Kafka message", err);
      }
    },
  });

  console.log("Kafka consumer started on", config.broker, "topic", config.topic);
}

// Called from settings save
export async function restartKafkaWithConfig(newConfig: KafkaConfig) {
  state.settings.kafka = newConfig;
  if (state.settings.mode === "live") {
    await startKafkaConsumer(newConfig);
  }
}
