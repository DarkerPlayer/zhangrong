"""Cross-process model operation lock; the kernel releases it even after a worker crash."""
import fcntl
import json
import os
from pathlib import Path


class ImageOperationLock:
    def __init__(self, directory, kind, inherited_fd=None):
        self.directory = Path(directory)
        self.kind = kind
        self.inherited_fd = inherited_fd
        self.stream = None
        self.fd = inherited_fd

    def __enter__(self):
        if self.inherited_fd is not None:
            # Installer subprocesses share their parent's already-locked file description.
            os.fstat(self.inherited_fd)
            return self
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        file = self.directory / '.image-operation.lock'
        self.stream = file.open('a+')
        os.chmod(file, 0o600)
        try:
            fcntl.flock(self.stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.stream.close()
            self.stream = None
            raise RuntimeError('另一个应用窗口的本地任务正在运行，请等待或取消后重试。') from None
        self.fd = self.stream.fileno()
        self.stream.seek(0)
        self.stream.truncate()
        self.stream.write(json.dumps({'pid': os.getpid(), 'kind': self.kind}))
        self.stream.flush()
        return self

    def __exit__(self, *args):
        if self.stream is not None:
            self.stream.seek(0)
            self.stream.truncate()
            fcntl.flock(self.stream.fileno(), fcntl.LOCK_UN)
            self.stream.close()
