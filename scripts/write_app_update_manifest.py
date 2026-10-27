import json
import os
from pathlib import Path


message = os.environ.get("RELEASE_COMMIT_MESSAGE", "")
notes = [
    line.strip(" -*")
    for line in message.splitlines()
    if line.strip() and not line.startswith(("Merge pull request", "Merge branch"))
]
if not notes:
    notes = ["Bug fixes and improvements"]

version_name = os.environ["APP_VERSION_NAME"]
manifest = {
    "versionCode": int(os.environ["APP_VERSION_CODE"]),
    "versionName": version_name,
    "downloadUrl": "https://github.com/gujjulavamsi007-sys/invictus-tracker/releases/latest/download/trip-petrol-expense-tracker.apk",
    "releaseUrl": f"https://github.com/gujjulavamsi007-sys/invictus-tracker/releases/tag/v{version_name}",
    "whatsNew": notes[:8],
}
Path("app-update.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
