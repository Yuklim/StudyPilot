"""Playwright-only launcher; temporary data and owned processes are always scoped.

Run via frontend's test:e2e command, never as the normal application launcher.
"""

import os
import signal
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from types import FrameType

from support import migrate, runtime_paths

from studypilot.infrastructure.database import create_database_engine


def interrupted(signum: int, frame: FrameType | None) -> None:
    raise KeyboardInterrupt


def main() -> int:
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    with TemporaryDirectory(prefix="studypilot-e2e-") as directory:
        paths = runtime_paths(Path(directory))
        engine = create_database_engine(paths.database_url)
        try:
            migrate(engine)
        finally:
            engine.dispose()
        environment = {
            **os.environ,
            "STUDYPILOT_DATABASE_URL": paths.database_url,
            "STUDYPILOT_FILES_ROOT": str(paths.files),
            "STUDYPILOT_API_PORT": "18000",
            "STUDYPILOT_UI_PORT": "15173",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        server = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "studypilot.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                "18000",
                "--no-access-log",
            ],
            cwd=paths.root,
            env=environment,
        )
        try:
            return server.wait()
        except KeyboardInterrupt:
            return 0
        finally:
            # Signals can target the process group; don't interrupt cleanup twice.
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            signal.signal(signal.SIGINT, signal.SIG_IGN)
            if server.poll() is None:
                server.terminate()
                try:
                    server.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()


if __name__ == "__main__":
    raise SystemExit(main())
