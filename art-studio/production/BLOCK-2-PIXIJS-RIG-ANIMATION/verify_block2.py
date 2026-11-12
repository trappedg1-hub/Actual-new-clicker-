#!/usr/bin/env python3
"""External BLOCK 2 verification. Run from the repository root after push."""

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BRANCH = "arena/02869c32-actual-new-clicker"
REPO = "trappedg1-hub/Actual-new-clicker-"
BASE = "54a876287ec6053a5681c3cf68aeffa6278c5901"
# BASE is the BLOCK 1 / BLOCK 2 boundary. HEAD may be the feature commit or a
# later fast-forward verification fix, so ancestry is checked, not a hard-coded parent.
APPROVED_B13 = "5bd23a22de6a52c304657d21e707309a0f106a57217bc753b4fbed1060d360db"
B2 = "art-studio/production/BLOCK-2-PIXIJS-RIG-ANIMATION"
STATE = "art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/PRODUCTION-STATE.json"

ALLOWED_CHANGED = {
    "README.md",
    "index.html",
    "src/app/scenes/MainScene.ts",
    "src/app/bootstrap/bootstrap.ts",
    "src/presentation/pixi/RewardFeedback.ts",
    "src/assets/heroine/README.md",
    "src/heroine/rig/ProductionHeroineRig.ts",
    "src/heroine/rig/animationMath.ts",
    "src/heroine/rig/heroineAssets.ts",
    "tests/heroineProductionRig.test.ts",
    STATE,
    f"{B2}/BLOCK-2-PROPOSAL.md",
    f"{B2}/BLOCK-2-REPORT.md",
    f"{B2}/VERIFICATION.json",
    f"{B2}/SHA256SUMS.txt",
    f"{B2}/verify_block2.py",
}

DOCS_FOR_TEXT_CHECKS = [
    "README.md",
    "index.html",
    "src/app/bootstrap/bootstrap.ts",
    "src/presentation/pixi/RewardFeedback.ts",
    "src/assets/heroine/README.md",
    STATE,
    f"{B2}/BLOCK-2-PROPOSAL.md",
    f"{B2}/BLOCK-2-REPORT.md",
    f"{B2}/VERIFICATION.json",
]

MARKDOWN_FILES = [
    "README.md",
    "src/assets/heroine/README.md",
    f"{B2}/BLOCK-2-PROPOSAL.md",
    f"{B2}/BLOCK-2-REPORT.md",
]

CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]")
OLD_LABELS = re.compile(r"\b(?:B2|B3|B4|B5|B6|E4|E5|E6|E7|E8)\b")
LINK = re.compile(r"\[[^\]]*\]\(([^)]+)\)")


def run(args, *, binary=False):
    return subprocess.check_output(args, cwd=ROOT, text=not binary)


def git(*args, binary=False):
    return run(["git", *args], binary=binary)


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha256_file(path):
    return sha256_bytes((ROOT / path).read_bytes())


def http_code(url, host):
    return subprocess.check_output(
        [
            "curl",
            "-s",
            "-o",
            "/dev/null",
            "-w",
            "%{http_code}",
            "-H",
            f"Host: {host}",
            url,
        ],
        cwd=ROOT,
        text=True,
    ).strip()


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    results = {}

    # 1. Git / remote identity.
    subprocess.check_call(["git", "fetch", "--quiet", "origin", BRANCH], cwd=ROOT)
    branch = git("rev-parse", "--abbrev-ref", "HEAD").strip()
    local = git("rev-parse", "HEAD").strip()
    origin = git("rev-parse", f"origin/{BRANCH}").strip()
    api = json.loads(
        run(["gh", "api", f"repos/{REPO}/commits/{BRANCH}"])
    )
    api_head = api["sha"]
    api_parent = api["parents"][0]["sha"]
    check(branch == BRANCH, f"wrong branch {branch}")
    check(local == origin == api_head, "local/origin/GitHub API HEAD mismatch")
    subprocess.check_call(
        ["git", "merge-base", "--is-ancestor", BASE, "HEAD"], cwd=ROOT
    )
    subprocess.check_call(
        ["git", "merge-base", "--is-ancestor", BASE, api_parent], cwd=ROOT
    )
    check("BLOCK 2" in api["commit"]["message"], "commit message does not name BLOCK 2")
    api_files = {f["filename"] for f in api["files"]}
    check(
        api_files.issubset(ALLOWED_CHANGED),
        f"HEAD commit touched unexpected files: {api_files - ALLOWED_CHANGED}",
    )
    results.update(
        branch=branch,
        commit=local,
        origin=origin,
        api=api_head,
        apiParent=api_parent,
        block2Base=BASE,
    )

    # 2. Remote recursive tree and blob identity.
    tree = json.loads(
        run(["gh", "api", f"repos/{REPO}/git/trees/{local}?recursive=1"])
    )
    check(tree.get("truncated") is False, "remote recursive tree is truncated")
    remote_blobs = {item["path"]: item["sha"] for item in tree["tree"] if item["type"] == "blob"}
    for path in ALLOWED_CHANGED:
        check(path in remote_blobs, f"missing remote blob {path}")
        local_blob = git("rev-parse", f"HEAD:{path}").strip()
        check(remote_blobs[path] == local_blob, f"remote blob mismatch {path}")
    unexpected_b2 = {
        p for p in remote_blobs if p.startswith(f"{B2}/") and p not in ALLOWED_CHANGED
    }
    check(not unexpected_b2, f"unexpected BLOCK 2 files {unexpected_b2}")
    results["remoteTreeTruncated"] = False
    results["remoteBlobsChecked"] = len(ALLOWED_CHANGED)

    # 3. Clean worktree and no generated tracked state.
    status = git("status", "--porcelain=v1", "--untracked-files=all").strip()
    check(status == "", f"worktree not clean: {status}")
    check(git("ls-files", "dist", "node_modules").strip() == "", "dist/node_modules tracked")
    check(git("ls-files", "*__pycache__*").strip() == "", "__pycache__ tracked")
    for ignored in ("dist", "node_modules"):
        subprocess.check_call(["git", "check-ignore", "-q", ignored], cwd=ROOT)
    results["worktreeClean"] = True
    results["distIgnored"] = True
    results["nodeModulesIgnored"] = True
    results["noPycache"] = True

    # 4. Exactly one intended change set, no new art or dependency changes.
    changed = set(git("diff", "--name-only", BASE, "HEAD").splitlines())
    check(changed == ALLOWED_CHANGED, f"unexpected diff {changed ^ ALLOWED_CHANGED}")
    image_suffixes = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
    check(
        not any(Path(p).suffix.lower() in image_suffixes for p in changed),
        "new image asset in BLOCK 2 diff",
    )
    check(not list((ROOT / B2).rglob("*.png")), "PNG inside BLOCK 2 directory")
    check(
        git("diff", "--name-only", BASE, "HEAD", "--", "public", "package.json", "package-lock.json", "vite.config.ts", "src/content/dialogues/intro.json").strip() == "",
        "unexpected change to public/deps/config/compiled Ink",
    )
    results["changedFiles"] = len(changed)
    results["newImageAssets"] = 0

    # 5. Protected approved art files from the BLOCK 1 base commit.
    base_paths = git("ls-tree", "-r", "--name-only", BASE).splitlines()
    protected = [
        p
        for p in base_paths
        if p.startswith("art-studio/")
        and p != STATE
        and not p.startswith(f"{B2}/")
    ]
    protected_changed = []
    for rel in protected:
        expected = sha256_bytes(git("show", f"{BASE}:{rel}", binary=True))
        current = sha256_file(rel)
        if expected != current:
            protected_changed.append(rel)
    check(len(protected) == 1041, f"unexpected protected count {len(protected)}")
    check(not protected_changed, f"protected art changed {protected_changed[:5]}")
    check(
        sha256_file("art-studio/stages/05-independent-layers/B1-BACKGROUND-CLEANUP-BATCH-01/work-cutout-after.png") == APPROVED_B13,
        "approved B1.3 result changed",
    )
    preflight = json.loads((ROOT / "art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/PREFLIGHT.json").read_text())
    for rel, expected in preflight["criticalHashes"].items():
        check(sha256_file(rel) == expected, f"critical hash changed {rel}")
    results["protectedArtFilesChecked"] = len(protected)
    results["protectedArtFilesChanged"] = len(protected_changed)
    results["approvedB13Unchanged"] = True
    results["criticalHashesChecked"] = len(preflight["criticalHashes"])

    # 6. JSON / text / state assertions.
    for rel in [STATE, f"{B2}/VERIFICATION.json"]:
        json.loads((ROOT / rel).read_text())
    state = json.loads((ROOT / STATE).read_text())
    verification = json.loads((ROOT / f"{B2}/VERIFICATION.json").read_text())
    check(state["block1"]["visualReview"]["awaitingUser"] is False, "stale B1 awaitingUser flag")
    check(state["b13"]["visualApproval"] == "APPROVED_BY_USER", "B1.3 approval overwritten")
    check(state["block2"]["checks"]["nodeTests"] == 31, "state nodeTests not 31")
    check(state["block2"]["checks"]["protectedArtFilesChanged"] == 0, "state protected count wrong")
    check(state["gates"]["vercelPreview"] is False, "vercelPreview gate opened")
    check(state["gates"]["productionDeployment"] is False, "productionDeployment gate opened")
    check(state["gates"]["prMerge"] is False, "prMerge gate opened")
    check(state["gates"]["vercelApiCalls"] == 0, "vercelApiCalls not zero")
    check(
        state["gates"]["block3NeedsSeparateConsolidatedProposalApproval"] is True,
        "BLOCK 3 gate missing",
    )
    check(
        verification["status"] == "TECHNICAL_PASS / NOT_ARTISTICALLY_APPROVED",
        "verification status wrong",
    )
    check(verification["implementation"]["runtimeTextures"] == 35, "runtimeTextures not 35")
    check(verification["checks"]["nodeTestsPassed"] == 31, "verification tests not 31")
    # Guard the iPhone visual-defect mitigation in runtime source.
    bootstrap_src = (ROOT / "src/app/bootstrap/bootstrap.ts").read_text()
    check("roundPixels: true" in bootstrap_src, "renderer pixel snapping missing")
    check(
        "Math.min(window.devicePixelRatio || 1, 3)" in bootstrap_src,
        "native resolution cap missing",
    )
    feedback_src = (ROOT / "src/presentation/pixi/RewardFeedback.ts").read_text()
    check("#321844" not in feedback_src, "dark tap-toast stroke restored")
    scene_src = (ROOT / "src/app/scenes/MainScene.ts").read_text()
    check("rewardToastY" in scene_src, "tap toasts not relocated")
    math_src = (ROOT / "src/heroine/rig/animationMath.ts").read_text()
    check("Math.round(-8 * breath)" in math_src, "integer breathing missing")
    check("scaleY: 1," in math_src, "root scaling restored")
    results["visualDefectMitigationGuards"] = True
    results["jsonValid"] = True
    results["stateGatesOk"] = True

    for rel in DOCS_FOR_TEXT_CHECKS:
        text = (ROOT / rel).read_text()
        check(not CJK.search(text), f"CJK found in {rel}")
        check(not OLD_LABELS.search(text), f"old stage label found in {rel}")
    check('"awaitingUser": true' not in (ROOT / STATE).read_text(), "stale awaitingUser string")
    results["cjkInNewDocs"] = False
    results["oldStageLabels"] = False

    # 7. Markdown links resolve.
    link_count = 0
    for rel in MARKDOWN_FILES:
        path = ROOT / rel
        for target in LINK.findall(path.read_text()):
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            clean = target.split("#", 1)[0].split("?", 1)[0]
            if not clean:
                continue
            resolved = (path.parent / clean).resolve()
            check(resolved.exists(), f"broken link in {rel}: {target}")
            link_count += 1
    results["markdownLinksChecked"] = link_count

    # 8. Checksums.
    checksum_output = subprocess.check_output(
        ["sha256sum", "-c", f"{B2}/SHA256SUMS.txt"], cwd=ROOT, text=True
    )
    check("FAILED" not in checksum_output, "SHA256SUMS.txt verification failed")
    checksum_paths = {
        line.split("  ", 1)[1].strip()
        for line in (ROOT / B2 / "SHA256SUMS.txt").read_text().splitlines()
        if line.strip()
    }
    expected_checksum_paths = ALLOWED_CHANGED - {f"{B2}/SHA256SUMS.txt"}
    check(
        checksum_paths == expected_checksum_paths,
        f"checksum file set mismatch {checksum_paths ^ expected_checksum_paths}",
    )
    results["checksumsVerified"] = True
    results["checksumFiles"] = len(checksum_paths)

    # 9. Live Vite / Arena preview smoke checks.
    host = "5173-arena.e2b.app"
    base_url = "http://127.0.0.1:5173"
    checks = {
        "/": 200,
        "/src/main.ts": 200,
        "/src/heroine/rig/ProductionHeroineRig.ts": 200,
        "/src/heroine/rig/heroineAssets.ts": 200,
        "/art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/13_head.png": 200,
        "/art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/assembly/state-00-neutral.png": 200,
        "/art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/states/state-eye_r_closed-B.png": 200,
        "/art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/underlays/UNDERLAY-UNION.png": 200,
        "/art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/references/switch-matrix.json?import": 200,
    }
    for path, expected in checks.items():
        code = http_code(base_url + path, host)
        check(code == str(expected), f"HTTP {code} for {path}")
    check(http_code(base_url + "/", "evil.example.com") == "403", "unlisted host not rejected")
    module = subprocess.check_output(
        ["curl", "-s", "-H", f"Host: {host}", base_url + "/src/heroine/rig/heroineAssets.ts"],
        cwd=ROOT,
        text=True,
    )
    urls = sorted(set(re.findall(r"/art-studio/production[^\"']*", module)))
    for url in urls:
        code = http_code(base_url + url, host)
        check(code == "200", f"HTTP {code} for production URL {url}")
    results["httpPathsChecked"] = len(checks)
    results["productionUrlsHttp200"] = len(urls)
    results["unlistedHostHttp403"] = True

    results["result"] = "BLOCK2_EXTERNAL_VALIDATION_OK"
    output = json.dumps(results, ensure_ascii=False, sort_keys=True)
    Path("/tmp/b2_external_validation.json").write_text(output + "\n")
    print("BLOCK2_EXTERNAL_VALIDATION_OK", output)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"BLOCK2_EXTERNAL_VALIDATION_FAILED: {exc}", file=sys.stderr)
        raise
