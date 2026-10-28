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
    app_gradle_path = project_root / "android" / "app" / "build.gradle"
    plugin_source = project_root / "native" / "android" / "AppUpdaterPlugin.java"
    assistant_plugin_source = project_root / "native" / "android" / "ApexAssistantPlugin.java"
    on_device_ai_plugin_source = project_root / "native" / "android" / "ApexOnDeviceAiPlugin.java"

    if not activity_path.is_file() or not manifest_path.is_file() or not app_gradle_path.is_file():
        raise FileNotFoundError("Capacitor Android files were not generated before app plugin setup.")
    if not plugin_source.is_file() or not assistant_plugin_source.is_file() or not on_device_ai_plugin_source.is_file():
        raise FileNotFoundError("The Android app plugins are missing from the source repository.")

    package_line = f"package {app_id};"
    activity_path.write_text(
        f"""{package_line}

import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {{
    @Override
    public void onCreate(Bundle savedInstanceState) {{
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(ApexAssistantPlugin.class);
        if (Build.VERSION.SDK_INT >= 26) {{
            try {{
                Class<?> aiPlugin = Class.forName("{app_id}.ApexOnDeviceAiPlugin");
                registerPlugin((Class<? extends Plugin>) aiPlugin);
            }} catch (ClassNotFoundException ignored) {{
                // Keep the tracker usable if the optional on-device model plugin is unavailable.
            }}
        }}
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
    assistant_plugin_text = assistant_plugin_source.read_text(encoding="utf-8")
    assistant_plugin_text = re.sub(
        r"^package\s+[^;]+;", package_line, assistant_plugin_text, count=1, flags=re.MULTILINE
    )
    (package_dir / "ApexAssistantPlugin.java").write_text(assistant_plugin_text, encoding="utf-8")
    on_device_ai_plugin_text = on_device_ai_plugin_source.read_text(encoding="utf-8")
    on_device_ai_plugin_text = re.sub(
        r"^package\s+[^;]+;", package_line, on_device_ai_plugin_text, count=1, flags=re.MULTILINE
    )
    (package_dir / "ApexOnDeviceAiPlugin.java").write_text(on_device_ai_plugin_text, encoding="utf-8")

    manifest = manifest_path.read_text(encoding="utf-8")
    if 'xmlns:tools="http://schemas.android.com/tools"' not in manifest:
        manifest = manifest.replace(
            'xmlns:android="http://schemas.android.com/apk/res/android"',
            'xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools"',
            1,
        )
    override_uses_sdk = '<uses-sdk tools:overrideLibrary="com.google.mlkit.genai.prompt,com.google.mlkit.genai.common,com.google.android.gms.common" />'
    if re.search(r"<uses-sdk\b[^>]*/>", manifest):
        manifest = re.sub(r"<uses-sdk\b[^>]*/>", override_uses_sdk, manifest, count=1)
    else:
        manifest = re.sub(
            r"(<manifest\b[^>]*>)",
            r"\1\n    " + override_uses_sdk,
            manifest,
            count=1,
            flags=re.DOTALL,
        )
    required_permissions = (
        "android.permission.INTERNET",
        "android.permission.REQUEST_INSTALL_PACKAGES",
        "android.permission.RECORD_AUDIO",
    )
    for permission in required_permissions:
        declaration = f'<uses-permission android:name="{permission}" />'
        if declaration not in manifest:
            manifest = manifest.replace("</manifest>", f"    {declaration}\n</manifest>", 1)
    manifest_path.write_text(manifest, encoding="utf-8")

    app_gradle = app_gradle_path.read_text(encoding="utf-8")
    required_dependencies = (
        'implementation "com.google.mlkit:genai-prompt:1.0.0-beta4"',
        # ML Kit beta4's download flow needs a newer coroutine runtime.
        'implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0"',
    )
    dependency_block = re.search(r"(?ms)^dependencies\s*\{.*?^\}", app_gradle)
    if not dependency_block:
        raise ValueError("Could not find the Android app dependencies block.")
    block = dependency_block.group(0)
    for dependency in required_dependencies:
        if dependency not in block:
            block = block[:-1] + f"    {dependency}\n}}"
    app_gradle_path.write_text(app_gradle[:dependency_block.start()] + block + app_gradle[dependency_block.end():], encoding="utf-8")


if __name__ == "__main__":
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
    configure_android_project(root)
