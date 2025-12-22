# ui_dashboard.py
import json
from datetime import datetime

import pandas as pd
import streamlit as st
from confluent_kafka import Consumer

from client import read_config  # same helper you already use

TOPIC_ALERTS = "risk_alerts"


def risk_band(score: float) -> str:
    if score is None:
        return "UNKNOWN"
    if score >= 0.8:
        return "CRITICAL"
    if score >= 0.5:
        return "HIGH"
    if score >= 0.3:
        return "MEDIUM"
    return "LOW"


@st.cache_resource
def get_consumer():
    """
    Keep a single Kafka consumer across Streamlit reruns.
    """
    conf = read_config()
    conf.update(
        {
            "group.id": "ui-dashboard",
            "auto.offset.reset": "earliest",
            "enable.auto.commit": True,
        }
    )

    consumer = Consumer(conf)
    consumer.subscribe([TOPIC_ALERTS])
    return consumer


def poll_new_alerts(consumer, max_batch: int = 100):
    """
    Poll up to max_batch new messages from Kafka.
    """
    alerts = []
    for _ in range(max_batch):
        msg = consumer.poll(0.1)
        if msg is None:
            break
        if msg.error():
            # you can log this to the page if you like
            continue
        raw = msg.value()
        if not raw:
            continue
        try:
            alert = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            continue

        # enrich with parsed time and risk band
        ts = alert.get("timestamp")
        try:
            alert["timestamp_parsed"] = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            alert["timestamp_parsed"] = None

        score = alert.get("risk_score")
        alert["risk_level"] = risk_band(score)

        alerts.append(alert)
    return alerts


def main():
    st.set_page_config(page_title="StreamSafe 4D Dashboard", layout="wide")

    st.title("StreamSafe 4D - Live Risk Dashboard")
    st.caption("Streaming risk alerts from Confluent Cloud")

    consumer = get_consumer()

    # store all alerts in session state for this UI session
    if "alerts" not in st.session_state:
        st.session_state.alerts = []

    # controls row
    col1, col2, col3 = st.columns([1, 1, 2])
    with col1:
        if st.button("Fetch latest alerts"):
            new_alerts = poll_new_alerts(consumer)
            st.session_state.alerts.extend(new_alerts)
    with col2:
        if st.button("Clear alerts"):
            st.session_state.alerts = []

    alerts = st.session_state.alerts

    if not alerts:
        st.info("No alerts fetched yet. Click 'Fetch latest alerts' while the simulator and risk engine are running.")
        return

    df = pd.DataFrame(alerts)

    # sidebar filters
    workers = sorted(df["worker_id"].dropna().unique())
    zones = sorted(df["zone_id"].dropna().unique())
    levels = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

    st.sidebar.header("Filters")
    worker_filter = st.sidebar.multiselect("Worker", workers, default=workers)
    zone_filter = st.sidebar.multiselect("Zone", zones, default=zones)
    level_filter = st.sidebar.multiselect("Risk level", levels, default=levels)

    mask = (
        df["worker_id"].isin(worker_filter)
        & df["zone_id"].isin(zone_filter)
        & df["risk_level"].isin(level_filter)
    )
    df_f = df[mask].copy()

    # sort by time
    if "timestamp_parsed" in df_f.columns:
        df_f = df_f.sort_values("timestamp_parsed", ascending=False)

    # headline metrics
    latest = df_f.iloc[0]
    col_a, col_b, col_c, col_d = st.columns(4)
    col_a.metric("Latest risk", f"{latest['risk_score']:.3f}", latest["risk_level"])
    col_b.metric("Worker", latest["worker_id"])
    col_c.metric("Zone", latest["zone_id"])
    col_d.metric("Behavior", str(latest.get("behavior_class")))

    st.subheader("Recent alerts")

    show_cols = [
        "timestamp",
        "worker_id",
        "zone_id",
        "risk_score",
        "risk_level",
        "behavior_class",
        "machine_state",
    ]
    show_cols = [c for c in show_cols if c in df_f.columns]

    st.dataframe(
        df_f[show_cols].head(100),
        use_container_width=True,
    )


if __name__ == "__main__":
    main()
