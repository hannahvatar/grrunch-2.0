"""Upload recipe photos to the recipe-photos bucket and link them.

Recipe photos used to be bundled in the app (app/lib/recipeImages.ts), so a
new photo needed a new TestFlight build. Now each recipe has an image_url
pointing at the public recipe-photos bucket, and the app shows it right away
(see 20261015010000_recipe_photos_online.sql).

Usage, from the repo root:

  # One recipe (the usual weekly case):
  python3 scripts/upload_recipe_photo.py "Schnitzel Happens" app/assets/schnitzel-happens.jpeg

  # Every photo listed in app/lib/recipeImages.ts (the one-time backfill;
  # safe to re-run, it overwrites):
  python3 scripts/upload_recipe_photo.py --all

Photos are resized to 1200 px wide (JPEG, quality 80) with macOS `sips`
before upload, so cards load quickly. The original file is left untouched.
Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from scripts/.env).
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUCKET = "recipe-photos"
MAX_WIDTH = 1200


def load_env():
    for env_path in (os.path.join(ROOT, "scripts", ".env"), os.path.join(ROOT, "app", ".env")):
        if not os.path.exists(env_path):
            continue
        for line in open(env_path):
            m = re.match(r"^\s*([A-Z_]+)\s*=\s*(.*?)\s*$", line)
            if m and m.group(2) and not os.environ.get(m.group(1)):
                os.environ[m.group(1)] = m.group(2).strip('"')
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (scripts/.env).")
    return url.rstrip("/"), key


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def resized_copy(path):
    """A JPEG no wider than MAX_WIDTH, in a temp file."""
    out = os.path.join(tempfile.mkdtemp(), "photo.jpeg")
    subprocess.run(
        ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80", "--resampleWidth", str(MAX_WIDTH), path, "--out", out],
        check=True, capture_output=True,
    )
    width = int(re.search(r"pixelWidth: (\d+)", subprocess.run(["sips", "-g", "pixelWidth", path], capture_output=True, text=True).stdout).group(1))
    if width <= MAX_WIDTH:
        # Don't upscale a smaller original: just re-encode it.
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80", path, "--out", out], check=True, capture_output=True)
    return out


def upload(url, key, recipe_name, path):
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    data = open(resized_copy(path), "rb").read()
    # A version suffix makes a replaced photo a new URL, so phones that
    # cached the old one pick up the new one.
    filename = f"{slug(recipe_name)}-{int(time.time())}.jpeg"
    req = urllib.request.Request(
        f"{url}/storage/v1/object/{BUCKET}/{filename}", data=data, method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "image/jpeg",
                 "Cache-Control": "max-age=31536000", "x-upsert": "true"},
    )
    urllib.request.urlopen(req).read()
    public_url = f"{url}/storage/v1/object/public/{BUCKET}/{filename}"

    req = urllib.request.Request(
        f"{url}/rest/v1/recipes?name=eq.{urllib.parse.quote(recipe_name)}",
        data=json.dumps({"image_url": public_url}).encode(), method="PATCH",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "Prefer": "return=representation"},
    )
    rows = json.loads(urllib.request.urlopen(req).read() or b"[]")
    if not rows:
        raise LookupError(f'No recipe named "{recipe_name}"')
    return public_url, len(data)


def bundled_photos():
    """(recipe name, file path) pairs from app/lib/recipeImages.ts."""
    src = open(os.path.join(ROOT, "app", "lib", "recipeImages.ts")).read()
    pairs = re.findall(r"""^\s*(['"])((?:(?!\1).)+)\1:\s*require\('\.\./assets/([^']+)'\)""", src, re.M)
    return [(name, os.path.join(ROOT, "app", "assets", f)) for _, name, f in pairs]


def main():
    url, key = load_env()
    if sys.argv[1:] == ["--all"]:
        jobs = bundled_photos()
    elif len(sys.argv) == 3:
        jobs = [(sys.argv[1], sys.argv[2])]
    else:
        sys.exit(__doc__)
    failed = 0
    for name, path in jobs:
        try:
            public_url, size = upload(url, key, name, path)
            print(f"ok    {name}  ({size // 1024} KB)")
        except Exception as e:  # keep going; report at the end
            failed += 1
            print(f"FAIL  {name}: {e}")
    print(f"\n{len(jobs) - failed} uploaded, {failed} failed.")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
