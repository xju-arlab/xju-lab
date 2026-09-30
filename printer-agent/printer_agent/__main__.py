from __future__ import annotations

import logging
import os

from . import __version__
from .agent import PrinterAgent
from .api import HttpApi
from .spooler import CupsSpooler


def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s %(message)s")
    base_url = os.environ.get("LAB_API_BASE_URL", "").strip()
    token = os.environ.get("PRINTER_AGENT_TOKEN", "").strip()
    destination = os.environ.get("CUPS_DESTINATION", "").strip()
    if not base_url.startswith("https://") and not base_url.startswith("http://127.0.0.1") and not base_url.startswith("http://localhost"):
        raise SystemExit("LAB_API_BASE_URL must use HTTPS (HTTP is allowed only for loopback development)")
    if len(token) < 40 or not destination:
        raise SystemExit("PRINTER_AGENT_TOKEN and CUPS_DESTINATION are required")
    api = HttpApi(base_url, token)
    spooler = CupsSpooler(destination)
    agent = PrinterAgent(api, spooler, agent_version=__version__)
    try:
        agent.run()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()