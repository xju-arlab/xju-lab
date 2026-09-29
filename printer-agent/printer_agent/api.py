"""Small standard-library HTTP client for the printer protocol."""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request


class ApiError(RuntimeError):
    def __init__(self, status: int, message: str = "Printer API request failed") -> None:
        super().__init__(message)
        self.status = status


class HttpApi:
    def __init__(self, base_url: str, token: str, timeout: float = 20) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def request(self, method: str, path: str, payload: dict | None = None, raw: bool = False):
        url = urllib.parse.urljoin(self.base_url + "/", path.lstrip("/"))
        body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
        headers = {"Authorization": "Bearer " + self.token, "Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                content = response.read()
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = json.loads(exc.read()).get("code", "")
            except Exception:
                pass
            raise ApiError(exc.code, detail or "Printer API request failed") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ApiError(503, "Printer API unavailable") from exc
        if raw:
            return content
        return json.loads(content) if content else None

    def poll(self) -> dict:
        return self.request("POST", "/api/v1/printer-agent/poll", {})

    def job_status(self, job_id: str, fencing_token: int) -> dict:
        query = urllib.parse.urlencode({"fencingToken": fencing_token})
        return self.request("GET", f"/api/v1/printer-agent/jobs/{job_id}?{query}")

    def download(self, content_url: str) -> bytes:
        return self.request("GET", content_url, raw=True)

    def update_status(self, job_id: str, state: str, fencing_token: int, version: int, detail: dict | None = None) -> dict:
        payload = {"state": state, "fencingToken": fencing_token, "version": version}
        if detail:
            payload["detail"] = detail
        return self.request("POST", f"/api/v1/printer-agent/jobs/{job_id}/status", payload)

    def heartbeat(self, payload: dict) -> dict:
        return self.request("POST", "/api/v1/printer-agent/heartbeat", payload)
