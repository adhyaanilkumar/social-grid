import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from checks import args, final_text, verdict  # noqa: E402

repo, transcript, setup_sha, origin = args()
answer = final_text(transcript).strip()
if not answer:
    verdict(False, "no answer")
if len(answer) > 280:
    verdict(False, f"{len(answer)} characters, over the 280 limit")
if "feed" not in answer.lower():
    verdict(False, f"doesn't describe FeedServiceImpl: {answer[:80]!r}")
verdict(True, f"{len(answer)} characters and on topic")
