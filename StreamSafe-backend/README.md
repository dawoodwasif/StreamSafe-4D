# StreamSafe 4D Backend (Video Stream + SlowFast + Kafka)

## 1) Create and activate a Conda environment

```bash
conda create -n streamsafe-backend python=3.10 -y
conda activate streamsafe-backend
```

## 2) Install Python dependencies

From this folder:

```bash
pip install -r requirements.txt
```

## 3) Dataset

Download the dataset from Mendeley Data:  
[https://data.mendeley.com/datasets/xjmtb22pff/1](https://data.mendeley.com/datasets/xjmtb22pff/1)

### Description
This dataset is presented in the form of high-resolution video clips of safe and unsafe behaviours from a closed production area, to be used in occupational accident prevention studies.

The dataset was collected from the security cameras of a production facility operating in an organised industrial zone in Eskişehir, Turkey, after obtaining the necessary permissions from company officials and employees.

A total of **8 classes of behaviours** (**4 safe** and **4 unsafe**) were identified for the dataset and **691 video clips** containing these behaviours were obtained.

### Related paper
The following article is related to this dataset:  
[https://link.springer.com/article/10.1007/s11042-024-19276-8](https://link.springer.com/article/10.1007/s11042-024-19276-8)

### Setup (download/unzip)
1. Download the ZIP from the Mendeley link above
2. Unzip it **into this folder** so the directory structure contains:

- `Safe-and-Unsafe-Behaviours-Dataset/`
  - `annotations.csv`
  - `train/`, `test/`, etc.

## 4) Run the streaming server

Run:

```bash
python streamsafed_server.py \
  --video-folder Safe-and-Unsafe-Behaviours-Dataset/test \
  --checkpoint slowfast_streamsafe.pt \
  --annotations Safe-and-Unsafe-Behaviours-Dataset/annotations.csv \
  --data-root . \
  --port 8823
```

Expected startup log includes something like:

```text
Using device: cuda
Num classes: 8
INFO:     Started server process [27304]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8823 (Press CTRL+C to quit)
```

## 5) Endpoints

- Health check: `GET http://localhost:8823/health`
- MJPEG stream: `GET http://localhost:8823/stream`

## Kafka backbone (Confluent Cloud)

StreamSafe uses a **cloud-hosted Kafka cluster on Confluent Cloud** as the backbone for all streaming data.

### 1) Create a Kafka cluster in Confluent Cloud
1. Create a Confluent Cloud account: [https://confluent.cloud/](https://confluent.cloud/)
2. Create a **Kafka cluster** (Basic/Standard/Dedicated as needed)
3. Note the cluster **Bootstrap server** from the cluster settings (e.g., `pkc-xxxxx.<region>.aws.confluent.cloud:9092`)

Confluent Cloud docs:
- Kafka cluster quickstart: [https://docs.confluent.io/cloud/current/get-started/index.html](https://docs.confluent.io/cloud/current/get-started/index.html)

### 2) Create a Kafka API key + secret (programmatic access)
1. In the Confluent Cloud UI, create an **API key and secret** for the Kafka cluster
2. Store them securely (do not commit to git)

Docs:
- API keys: [https://docs.confluent.io/cloud/current/access-management/authenticate/api-keys/api-keys.html](https://docs.confluent.io/cloud/current/access-management/authenticate/api-keys/api-keys.html)

### 3) Wire credentials via `read_config()` (no hardcoded secrets)
Connection details (bootstrap servers + API key/secret + security protocol/SASL settings) are wrapped in a small helper:
- `read_config()` in `client.py`

This helper returns a configuration dictionary compatible with `confluent_kafka.Producer`, and keeps secrets **out of main code** (e.g., not embedded in `streamsafed_server.py`).

Reference:
- Confluent Python client: [https://github.com/confluentinc/confluent-kafka-python](https://github.com/confluentinc/confluent-kafka-python)

### 4) Topics used by StreamSafe
The pipeline publishes JSON events to three Kafka topics:
- `behavior_events`
- `pose_events`
- `machine_state`

---

## Runtime pipeline (YOLO + SlowFast → Kafka + MJPEG stream)

At runtime, the StreamSafe pipeline runs **YOLO + SlowFast** on warehouse videos and behaves as both:
1) a **visual inference engine** (annotated frames), and  
2) a **Kafka event producer** (structured JSON telemetry)

### What runs where
- `StreamSafePipeline` loops over all `.mp4` files in the configured folder.
- YOLO performs **person detection** (class `0`).
- SlowFast performs **behavior classification** on a rolling clip buffer (`num_frames`, default 32).
- FastAPI serves annotated frames via:
  - `GET /stream` as an MJPEG stream (`multipart/x-mixed-replace`)

### Events emitted on each new SlowFast prediction
Every time a new SlowFast prediction is produced, the pipeline constructs three events:

1. **behavior_event**
   - class / type / base risk / probability
2. **pose_event** (synthetic)
   - world position, distance to boundary, approach speed
3. **machine_state** (synthetic)
   - periodic `IDLE` → `MOVING` → `ACTIVE_DANGER` cycle bound to zones

These events are serialized as JSON and published via the Confluent Cloud producer to:
- `behavior_events`
- `pose_events`
- `machine_state`

---

## Stream processing (ksqlDB streams + joins → `risk_features`)

On the streaming side, Confluent topics are treated as the canonical **“data in motion”** for safety analytics.

### Modeling as ksqlDB streams
The three core topics are modeled as **ksqlDB streams** with explicit JSON schemas.

Docs:
- ksqlDB overview: [https://docs.confluent.io/platform/current/ksqldb/index.html](https://docs.confluent.io/platform/current/ksqldb/index.html)

Example (skeleton; adapt fields/types to your exact JSON):
```sql
-- behavior events
CREATE STREAM behavior_events (
  worker_id VARCHAR,
  timestamp VARCHAR,
  camera_id VARCHAR,
  zone_id VARCHAR,
  behavior_class VARCHAR,
  behavior_type VARCHAR,
  base_risk DOUBLE,
  probability DOUBLE
) WITH (
  KAFKA_TOPIC='behavior_events',
  VALUE_FORMAT='JSON'
);

-- pose events
CREATE STREAM pose_events (
  worker_id VARCHAR,
  timestamp VARCHAR,
  camera_id VARCHAR,
  zone_id VARCHAR,
  world_x_m DOUBLE,
  world_y_m DOUBLE,
  distance_to_boundary_m DOUBLE,
  approach_speed_m_s DOUBLE
) WITH (
  KAFKA_TOPIC='pose_events',
  VALUE_FORMAT='JSON'
);

-- machine state
CREATE STREAM machine_state (
  timestamp VARCHAR,
  machine_id VARCHAR,
  zone_id VARCHAR,
  state VARCHAR,
  speed_m_s DOUBLE
) WITH (
  KAFKA_TOPIC='machine_state',
  VALUE_FORMAT='JSON'
);
```

### Building `risk_features` via windowed joins
In ksqlDB, these streams can be joined on worker and zone identifiers within short time windows to build a derived `risk_features` stream (behavior labels + kinematics + machine telemetry).

Example (conceptual skeleton):
```sql
CREATE STREAM risk_features AS
SELECT
  b.worker_id,
  b.zone_id,
  b.timestamp,
  b.behavior_class,
  b.behavior_type,
  b.base_risk,
  b.probability,
  p.distance_to_boundary_m,
  p.approach_speed_m_s,
  m.state AS machine_state,
  m.speed_m_s AS machine_speed_m_s
FROM behavior_events b
JOIN pose_events p
  WITHIN 10 SECONDS
  ON b.worker_id = p.worker_id
JOIN machine_state m
  WITHIN 10 SECONDS
  ON b.zone_id = m.zone_id
EMIT CHANGES;
```

This derived stream can then drive:
- real-time risk scoring
- alerting
- dashboards
- downstream storage (e.g., sinks to object storage / databases)

## Acknowledgements

This project uses the **Safe-and-Unsafe Behaviours Dataset** hosted on Mendeley Data:  
- Mendeley Data dataset: [https://data.mendeley.com/datasets/xjmtb22pff/1](https://data.mendeley.com/datasets/xjmtb22pff/1)

The dataset and its use in occupational accident prevention research are described in the following publication (Springer / *Multimedia Tools and Applications*):  
- Springer article: [https://link.springer.com/article/10.1007/s11042-024-19276-8](https://link.springer.com/article/10.1007/s11042-024-19276-8)
