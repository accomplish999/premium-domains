#!/usr/bin/env python3
"""Run HumbleWorth price-predict-v1 on CPU.

The weights ship inside the public image
r8.im/humbleworth/price-predict-v1 (version a925db84). Hugging Face publishes
other HumbleWorth models, not this prediction head. This script pulls the
pinned layer, keeps the head and the MiniLM tokenizer, and applies the same
curve the image's predict.py uses.

Auction is probability 0.5. Marketplace is 0.025 (the 97.5th percentile on
their decreasing curve). Brokerage is 0.0075 (the 99.25th percentile).
The year feature stays at 2024, which is the year baked into that checkpoint.
"""

from __future__ import annotations

import json
import os
import sys
import tarfile
from pathlib import Path
from urllib.request import Request, urlopen

REPO = "humbleworth/price-predict-v1"
MANIFEST = "sha256:a925db842c707850e4ca7b7e86b217692b0353a9ca05eb028802c4a85db93843"
LAYER = "sha256:4d8953c6864d2d35d6aecdc1cecc8003686216c1e40bbd72966ab1f9ecc9dd4d"
USER_AGENT = "premium-domains/0.1 (+https://github.com/accomplish999/premium-domains)"

NEEDED = {
    "src/models/small-bce/domain_model_0.pt": "small-bce/domain_model_0.pt",
    "src/models/small-bce/word_model_0.pt": "small-bce/word_model_0.pt",
    "src/models/small-bce/prediction.pt": "small-bce/prediction.pt",
    "src/models/all-MiniLM-L12-v2/config.json": "all-MiniLM-L12-v2/config.json",
    "src/models/all-MiniLM-L12-v2/tokenizer.json": "all-MiniLM-L12-v2/tokenizer.json",
    "src/models/all-MiniLM-L12-v2/tokenizer_config.json": "all-MiniLM-L12-v2/tokenizer_config.json",
    "src/models/all-MiniLM-L12-v2/special_tokens_map.json": "all-MiniLM-L12-v2/special_tokens_map.json",
    "src/models/all-MiniLM-L12-v2/vocab.txt": "all-MiniLM-L12-v2/vocab.txt",
}
SIZES = {
    "small-bce/domain_model_0.pt": 133_519_794,
    "small-bce/word_model_0.pt": 133_519_328,
    "small-bce/prediction.pt": 2_499_505,
}

CURRENT_YEAR = 2024
OUTPUT_SIZE = 42
AUCTION_P = 0.5
MARKETPLACE_P = 0.025
BROKERAGE_P = 0.0075


def cache_dir() -> Path:
    override = os.environ.get("PREMIUM_DOMAINS_MODEL_DIR", "").strip()
    if override:
        return Path(override)
    return Path.home() / ".cache" / "premium-domains" / "humbleworth-price-predict-v1"


def ready(dest: Path) -> bool:
    for rel, size in SIZES.items():
        path = dest / rel
        if not path.is_file() or path.stat().st_size != size:
            return False
    for rel in NEEDED.values():
        if rel in SIZES:
            continue
        if not (dest / rel).is_file() or (dest / rel).stat().st_size < 1:
            return False
    return True


def fetch_json(url: str, accept: str) -> dict:
    request = Request(url, headers={"Accept": accept, "User-Agent": USER_AGENT})
    with urlopen(request, timeout=120) as response:
        return json.load(response)


def ensure_weights(dest: Path) -> None:
    if ready(dest):
        return
    manifest = fetch_json(
        f"https://r8.im/v2/{REPO}/manifests/{MANIFEST}",
        "application/vnd.docker.distribution.manifest.v2+json",
    )
    layers = {layer.get("digest") for layer in manifest.get("layers", [])}
    if LAYER not in layers:
        raise RuntimeError(f"Pinned layer {LAYER} is not in image {MANIFEST}.")
    dest.mkdir(parents=True, exist_ok=True)
    print(f"Downloading HumbleWorth weights from {LAYER[:19]}...", file=sys.stderr, flush=True)
    request = Request(
        f"https://r8.im/v2/{REPO}/blobs/{LAYER}",
        headers={"User-Agent": USER_AGENT},
    )
    found: set[str] = set()
    with urlopen(request, timeout=600) as response, tarfile.open(fileobj=response, mode="r|gz") as archive:
        for member in archive:
            rel = NEEDED.get(member.name)
            if rel is None or not member.isfile():
                continue
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            extracted = archive.extractfile(member)
            if extracted is None:
                continue
            partial = target.with_suffix(target.suffix + ".partial")
            with partial.open("wb") as handle:
                while True:
                    chunk = extracted.read(1024 * 1024)
                    if not chunk:
                        break
                    handle.write(chunk)
            partial.replace(target)
            found.add(member.name)
            print(f"  {rel} ({target.stat().st_size} bytes)", file=sys.stderr, flush=True)
            if len(found) == len(NEEDED):
                break
    missing = [name for name in NEEDED if name not in found]
    if missing:
        raise RuntimeError("Image layer did not contain " + ", ".join(missing))
    if not ready(dest):
        raise RuntimeError("Downloaded HumbleWorth files failed the size check.")


def value_curve(x, a, b, c, d):
    import numpy as np

    return a * -np.tanh((x - b) / c) + d


def value_at_probability(y: float, a: float, b: float, c: float, d: float) -> float:
    import numpy as np

    if a == 0:
        return 0.0
    xin = (d - y) / a
    if xin > 1:
        return float(round(25 * pow(2, 20)))
    if xin < -1:
        return 0.0
    try:
        exp = c * np.arctanh(xin) + b
        return float(round(25 * pow(2, float(exp) / 2)))
    except Exception:
        return 0.0


class Predictor:
    def __init__(self, dest: Path) -> None:
        import torch
        from torch import nn
        from transformers import AutoConfig, AutoModel, AutoTokenizer
        import wordsegment

        wordsegment.load()
        self.wordsegment = wordsegment
        self.torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(dest / "all-MiniLM-L12-v2")
        config = AutoConfig.from_pretrained(dest / "all-MiniLM-L12-v2")
        self.domain_model = self._load_encoder(dest / "small-bce" / "domain_model_0.pt", config)
        self.word_model = self._load_encoder(dest / "small-bce" / "word_model_0.pt", config)
        hidden = config.hidden_size * 2 + 1
        self.prediction = nn.Sequential(
            nn.Dropout(0.5),
            nn.Linear(hidden, hidden),
            nn.Tanh(),
            nn.Dropout(0.5),
            nn.Linear(hidden, OUTPUT_SIZE),
            nn.Sigmoid(),
        )
        state = torch.load(dest / "small-bce" / "prediction.pt", map_location="cpu", weights_only=True)
        self.prediction.load_state_dict(state)
        self.prediction.eval()

    def _load_encoder(self, path: Path, config):
        from transformers import AutoModel

        model = AutoModel.from_config(config)
        state = self.torch.load(path, map_location="cpu", weights_only=True)
        model.load_state_dict(state)
        model.eval()
        return model

    def _encode(self, model, texts: list[str], max_length: int):
        batch = self.tokenizer(
            texts,
            padding="max_length",
            truncation=True,
            max_length=max_length,
            return_tensors="pt",
        )
        output = model(**batch)
        token_embeddings = output[0]
        mask = batch["attention_mask"].unsqueeze(-1).expand(token_embeddings.size()).float()
        pooled = self.torch.sum(token_embeddings * mask, 1) / self.torch.clamp(mask.sum(1), min=1e-9)
        return pooled

    def predict(self, domains: list[str]) -> list[dict]:
        import numpy as np
        from scipy.optimize import curve_fit

        cleaned = [domain.strip().lower() for domain in domains if domain.strip()]
        if len(cleaned) > 2560:
            cleaned = cleaned[:2560]
        year = self.torch.tensor([[(CURRENT_YEAR - 1990) / (2025 - 1990)]], dtype=self.torch.float)
        rows: list[dict] = []
        with self.torch.no_grad():
            for start in range(0, len(cleaned), 64):
                batch = cleaned[start : start + 64]
                labels = [domain.split(".")[0] for domain in batch]
                segmented = [" ".join(self.wordsegment.segment(label)) for label in labels]
                domain_emb = self._encode(self.domain_model, batch, 32)
                word_emb = self._encode(self.word_model, segmented, 16)
                years = year.repeat(len(batch), 1)
                logits = self.prediction(self.torch.cat([domain_emb, word_emb, years], dim=1))
                logits = logits.detach().cpu().numpy()
                for domain, logit in zip(batch, logits):
                    try:
                        params = curve_fit(
                            value_curve,
                            np.arange(len(logit)),
                            logit,
                            bounds=([0, 0, 0, 0], [1, OUTPUT_SIZE + 4, OUTPUT_SIZE + 4, 1]),
                        )[0]
                    except Exception as exc:
                        rows.append(
                            {
                                "domain": domain,
                                "auction": None,
                                "marketplace": None,
                                "brokerage": None,
                                "error": str(exc),
                            }
                        )
                        continue
                    a, b, c, d = (float(param) for param in params)
                    rows.append(
                        {
                            "domain": domain,
                            "auction": value_at_probability(AUCTION_P, a, b, c, d),
                            "marketplace": value_at_probability(MARKETPLACE_P, a, b, c, d),
                            "brokerage": value_at_probability(BROKERAGE_P, a, b, c, d),
                            "error": None,
                        }
                    )
                print(f"valued {min(start + 64, len(cleaned))}/{len(cleaned)}", file=sys.stderr, flush=True)
        return rows


def main() -> int:
    dest = cache_dir()
    warm = "--warm" in sys.argv[1:]
    try:
        ensure_weights(dest)
        predictor = Predictor(dest)
        if warm:
            sample = predictor.predict(["example.com"])
            print(json.dumps(sample[0]), file=sys.stderr)
            return 0
        payload = json.load(sys.stdin)
        domains = payload.get("domains") if isinstance(payload, dict) else None
        if not isinstance(domains, list) or not all(isinstance(item, str) for item in domains):
            print("Expected {\"domains\": [..]} on stdin.", file=sys.stderr)
            return 2
        json.dump({"valuations": predictor.predict(domains)}, sys.stdout)
        sys.stdout.write("\n")
        return 0
    except Exception as exc:
        print(f"HumbleWorth local model failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
