from fastapi import FastAPI

from .db import fetch_schema_via_pg_meta

app = FastAPI(title="AI Resume Backend", version="0.2.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/schema")
def read_schema() -> dict:
    schema = fetch_schema_via_pg_meta()
    return schema
