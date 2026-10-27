import json
import re
import sys
from pathlib import Path


def configure_android_project(project_root: Path) -> None:
    config_path = project_root / "capacitor.config.json"
    app_id = json.loads(config_path.read_text(encoding="utf-8"))["appId"]
    package_dir = project_root / "android" / "app" / "src" / "main" / "java" / Path(*app_id.split("."))
    activity_path = package_dir / "MainActivity.java"
    manifest_path = project_root / "android" / "app" / "src" / "main" / "AndroidManifest.xml"
    plugin_source = project_root / "native" / "android" / "AppUpdaterPlugin.java"

    if not activity_path.is_file() or not manifest_path.is_file():
        raise FileNotFoundError("Capacitor Android files were not generated before updater setup.")

    package_line = f"package {app_id};"
    activity_path.write_text(
        f"""{package_line}

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {{
    @Override
    public void onCreate(Bundle savedInstanceState) {{
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }}
}}
""",
        encoding="utf-8",
    )

    plugin_text = plugin_source.read_text(encoding="utf-8")
    plugin_text = re.sub(r"^package\s+[^;]+;", package_line, plugin_text, count=1, flags=re.MULTILINE)
    package_dir.mkdir(parents=True, exist_ok=True)
    (package_dir / "AppUpdaterPlugin.java").write_text(plugin_text, encoding="utf-8")

    manifest = manifest_path.read_text(encoding="utf-8")
    required_permissions = (
        "android.permission.INTERNET",
        "android.permission.REQUEST_INSTALL_PACKAGES",
    )
    for permission in required_permissions:
        declaration = f'<uses-permission android:name="{permission}" />'
        if declaration not in manifest:
            manifest = manifest.replace("</manifest>", f"    {declaration}\n</manifest>", 1)
    manifest_path.write_text(manifest, encoding="utf-8")


if __name__ == "__main__":
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
    configure_android_project(root)
