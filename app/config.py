"""Application configuration: paths to directories and files."""

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DIR = PROJECT_ROOT / "public"
DATA_DIR = Path(os.environ.get("DATA_DIR", str(PROJECT_ROOT / "data")))
DEFAULTS_FILE = PUBLIC_DIR / "defaults.json"
DB_FILE = DATA_DIR / "network_organizer.db"