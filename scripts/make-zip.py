from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
out = root.parent / "백지도시_조사홈페이지_MVP_v0.3.18.zip"
if out.exists():
    out.unlink()
shutil.make_archive(str(out.with_suffix("")), "zip", root)
print(out)
