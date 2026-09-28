"""Flask API. On Vercel this file is the serverless entrypoint; locally run `python api/index.py`."""
from __future__ import annotations

import os
import sys

from flask import Flask, jsonify, request
from werkzeug.exceptions import HTTPException

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dcf.contract import FinancialsSnapshot  # noqa: E402
from dcf.engine import Assumptions, default_assumptions, historical_stats, run_dcf  # noqa: E402
from dcf.market import comps, risk_free_rate, suggest_peers  # noqa: E402
from dcf.sources import DEFAULT_SOURCE, SOURCES, get_snapshot  # noqa: E402

app = Flask(__name__)


class BadRequest(Exception):
    pass


@app.errorhandler(BadRequest)
@app.errorhandler(ValueError)
def _bad_request(e):
    return jsonify(error=str(e)), 400


@app.errorhandler(LookupError)
def _not_found(e):
    return jsonify(error=str(e)), 404


@app.errorhandler(Exception)
def _server_error(e):
    if isinstance(e, HTTPException):
        return jsonify(error=e.description), e.code
    app.logger.exception(e)
    return jsonify(error=f"Unexpected error: {e}"), 500


def _ticker() -> str:
    t = (request.args.get("ticker") or "").strip().upper()
    if not t or len(t) > 12:
        raise BadRequest("Provide a ticker, e.g. ?ticker=AAPL")
    return t


@app.get("/api/health")
def health():
    return jsonify(ok=True, sources=list(SOURCES))


@app.get("/api/financials")
def financials():
    """Snapshot + default assumptions, everything the frontend needs to start a model."""
    source = request.args.get("source", DEFAULT_SOURCE)
    snap = get_snapshot(_ticker(), source)
    rf, rf_source = risk_free_rate()
    assumptions, notes = default_assumptions(snap, rf)
    return jsonify(
        snapshot=snap.to_dict(),
        assumptions=assumptions.to_dict(),
        historical=historical_stats(snap),
        notes=notes,
        risk_free_source=rf_source,
        valuation=run_dcf(snap, assumptions),
    )


@app.post("/api/valuation")
def valuation():
    """Stateless: the client sends back the snapshot with its edited assumptions."""
    body = request.get_json(silent=True) or {}
    if "snapshot" not in body or "assumptions" not in body:
        raise BadRequest("Body must contain 'snapshot' and 'assumptions'")
    try:
        snap = FinancialsSnapshot.from_dict(body["snapshot"])
        assumptions = Assumptions.from_dict(body["assumptions"])
    except TypeError as e:
        raise BadRequest(f"Malformed payload: {e}")
    snap.validate()
    return jsonify(run_dcf(snap, assumptions))


@app.get("/api/peers")
def peers():
    return jsonify(peers=suggest_peers(_ticker()))


@app.get("/api/comps")
def comps_route():
    raw = request.args.get("peers")
    peer_list = [p.strip() for p in raw.split(",") if p.strip()][:8] if raw is not None else None
    return jsonify(comps(_ticker(), peer_list))


if __name__ == "__main__":
    app.run(port=int(os.environ.get("PORT", 5050)), debug=True)
