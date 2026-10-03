"""Install the isolated local image runtime. Network is used only to download public software/weights."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from local_image_lock import ImageOperationLock

MFLUX_VERSION = '0.20.0'
MODEL_REPO = 'Runpod/FLUX.2-klein-4B-mflux-4bit'
MODEL_REVISION = '7ee1b3aa8178a1240050490072196a57da2bf2a9'


def progress(phase, percent, message):
    print(json.dumps({'type': 'progress', 'phase': phase, 'progress': percent, 'message': message}, ensure_ascii=False), flush=True)


def sha256_file(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def download_resumable(url, target, expected_size, sha256=None, max_attempts=6, retry_delay=2):
    """Use the native TLS downloader with fixed partial files; verify pinned LFS hashes."""
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix + '.part')
    if target.exists() and target.stat().st_size == expected_size and (not sha256 or sha256_file(target) == sha256):
        return target
    target.unlink(missing_ok=True)
    if partial.exists() and partial.stat().st_size > expected_size:
        partial.unlink()
    last_error = ''
    for attempt in range(max_attempts):
        if not partial.exists() or partial.stat().st_size != expected_size:
            transfer = subprocess.run(['/usr/bin/curl', '--location', '--fail', '--silent', '--show-error', '--continue-at', '-',
                '--connect-timeout', '15', '--speed-time', '30', '--speed-limit', '1024', '--max-time', '300',
                '--output', str(partial), url], capture_output=True, text=True)
            last_error = transfer.stderr.strip()[-1000:]
            if transfer.returncode != 0:
                if attempt + 1 < max_attempts: time.sleep(retry_delay)
                continue
        if partial.stat().st_size != expected_size:
            last_error = '下载内容大小与固定模型版本不匹配'
        elif sha256 and sha256_file(partial) != sha256:
            last_error = '模型文件 SHA-256 校验失败'
            partial.unlink(missing_ok=True)
        else:
            partial.replace(target)
            return target
        if attempt + 1 < max_attempts: time.sleep(retry_delay)
    raise RuntimeError('模型下载失败，已保留进度，可重试安装。' + last_error)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--download-only', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--lock-fd', type=int, help=argparse.SUPPRESS)
    args = parser.parse_args()
    directory = Path(args.directory).resolve()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    with ImageOperationLock(directory, 'setup', inherited_fd=args.lock_fd) as operation:
        return install(args, directory, operation.fd)


def install(args, directory, lock_fd):
    if sys.platform != 'darwin' or platform.machine() != 'arm64':
        raise RuntimeError('本地生成第一版需要 Apple Silicon Mac。')
    runtime = directory / 'runtime'
    python = runtime / 'bin/python'
    if not args.download_only:
        uv = shutil.which('uv') or str(Path.home() / '.local/bin/uv')
        if not Path(uv).exists():
            raise RuntimeError('缺少 uv 本地安装工具，请先安装 uv 后重试。')
        progress('environment', 2, '准备独立 Python 环境')
        env = {**os.environ, 'UV_PYTHON_INSTALL_DIR': str(directory / 'python')}
        subprocess.run([uv, 'python', 'install', '3.12.13'], check=True, env=env, stdout=sys.stderr)
        subprocess.run([uv, 'venv', '--allow-existing', '--python', '3.12.13', str(runtime)], check=True, env=env, stdout=sys.stderr)
        progress('environment', 7, '安装 MLX 和 MFLUX 本地运行库')
        subprocess.run([uv, 'pip', 'install', '--python', str(python), 'mflux==' + MFLUX_VERSION, 'mlx==0.32.2', 'transformers==5.18.0', 'huggingface-hub==1.33.0'], check=True, env=env, stdout=sys.stderr)
        progress('environment', 15, '编译 macOS 本地抠图和面部定位工具')
        subprocess.run(['/usr/bin/xcrun', 'swiftc', '-O', str(Path(__file__).with_name('local-image-calibrate.swift')), '-o', str(runtime / 'bin/muyu-calibrate')], check=True, stdout=sys.stderr)
        # Run the download in the installed interpreter; no project-wide Python changes.
        subprocess.run([str(python), str(Path(__file__).resolve()), '--directory', str(directory), '--download-only', '--lock-fd', str(lock_fd)], check=True, pass_fds=(lock_fd,))
        return

    from huggingface_hub import HfApi
    from filelock import FileLock
    model_directory = directory / 'model'
    model_directory.mkdir(exist_ok=True)
    os.environ['HF_HUB_DISABLE_XET'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    remote = HfApi(token=False).model_info(MODEL_REPO, revision=MODEL_REVISION, files_metadata=True)
    files = [entry for entry in remote.siblings if entry.rfilename != '.gitattributes']
    total = sum(entry.size or 0 for entry in files)
    stop_monitor = threading.Event()
    def monitor():
        while not stop_monitor.is_set():
            downloaded = sum((model_directory / entry.rfilename).stat().st_size for entry in files if (model_directory / entry.rfilename).exists())
            downloaded += sum(file.stat().st_size for file in model_directory.glob('**/*.part') if file.exists())
            progress('download', min(98, 18 + downloaded / max(total, 1) * 80), f'下载本地模型：{min(downloaded, total) / 1e9:.2f} / {total / 1e9:.2f} GB')
            stop_monitor.wait(1)
    monitor_thread = threading.Thread(target=monitor, daemon=True)
    monitor_thread.start()
    def download(entry):
        target = model_directory / entry.rfilename
        target.parent.mkdir(parents=True, exist_ok=True)
        sha = entry.lfs.sha256 if entry.lfs else None
        with FileLock(str(target) + '.download.lock', timeout=30):
            # Recover any partial bytes from an earlier HF client before switching to resumable TLS.
            partial = target.with_suffix(target.suffix + '.part')
            if not target.exists() and not partial.exists() and sha:
                candidates = list(model_directory.glob('.cache/huggingface/download/**/*.' + sha + '.*.incomplete'))
                if candidates: max(candidates, key=lambda f: f.stat().st_size).replace(partial)
            url = 'https://huggingface.co/' + MODEL_REPO + '/resolve/' + MODEL_REVISION + '/' + entry.rfilename + '?download=true'
            downloaded = download_resumable(url, target, entry.size, sha)
        size = downloaded.stat().st_size
        if entry.size is not None and size != entry.size:
            raise RuntimeError('模型文件大小不完整，请重试安装：' + entry.rfilename)
        return {'path': entry.rfilename, 'size': size}
    try:
        # Transfers stream to disk; bounded concurrency uses negligible model RAM.
        with ThreadPoolExecutor(max_workers=3) as pool:
            manifest_files = list(pool.map(download, files))
    finally:
        stop_monitor.set()
        monitor_thread.join(timeout=2)
    for obsolete in model_directory.glob('.cache/huggingface/download/**/*.incomplete'):
        obsolete.unlink(missing_ok=True)
    # Verify the actual installed package can import MLX on this machine before reporting ready.
    import mlx.core as mx
    from mflux.models.flux2.variants import Flux2KleinEdit
    from importlib.metadata import version
    mx.eval(mx.array([1, 2]) + 1)
    if version('mflux') != MFLUX_VERSION:
        raise RuntimeError('MFLUX 版本与固定运行环境不匹配')
    manifest = {'mfluxVersion': MFLUX_VERSION, 'modelRepo': MODEL_REPO, 'modelRevision': MODEL_REVISION, 'files': manifest_files}
    staging = directory / 'runtime-manifest.json.tmp'
    staging.write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf8')
    staging.replace(directory / 'runtime-manifest.json')
    progress('ready', 100, '本地模型安装完成；生成时才会加载到内存')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'type': 'error', 'message': str(error)}, ensure_ascii=False), flush=True)
        sys.exit(1)
