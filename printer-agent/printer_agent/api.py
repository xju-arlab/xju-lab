"""Small standard-library HTTP client for printer status heartbeats."""
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

    def heartbeat(self, payload: dict) -> dict:
        url = urllib.parse.urljoin(self.base_url + "/", "/api/v1/printer-agent/heartbeat")
        body = json.dumps(payload, separators=(",", ":")).encode()
        request = urllib.request.Request(url, data=body, headers={
            "Authorization": "Bearer " + self.token,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }, method="POST")
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
        return json.loads(content) if content else {}