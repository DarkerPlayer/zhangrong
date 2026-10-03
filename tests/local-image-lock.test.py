import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('local_image_lock', Path(__file__).parents[1] / 'scripts/local_image_lock.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class OperationLockTests(unittest.TestCase):
    def test_second_process_cannot_acquire_while_owner_holds_lock(self):
        with tempfile.TemporaryDirectory() as folder:
            with module.ImageOperationLock(folder, 'generate'):
                child = subprocess.run([sys.executable, '-c', 'import sys;sys.path.insert(0,sys.argv[1]);from local_image_lock import ImageOperationLock;ImageOperationLock(sys.argv[2],"generate").__enter__()', str(Path(__file__).parents[1] / 'scripts'), folder], capture_output=True, text=True)
                self.assertNotEqual(child.returncode, 0)
                self.assertIn('正在运行', child.stderr)
            with module.ImageOperationLock(folder, 'setup'):
                pass

    def test_crashed_owner_releases_os_lock(self):
        with tempfile.TemporaryDirectory() as folder:
            child = subprocess.run([sys.executable, '-c', 'import sys,os;sys.path.insert(0,sys.argv[1]);from local_image_lock import ImageOperationLock;lock=ImageOperationLock(sys.argv[2],"generate");lock.__enter__();os._exit(1)', str(Path(__file__).parents[1] / 'scripts'), folder])
            self.assertEqual(child.returncode, 1)
            with module.ImageOperationLock(folder, 'generate'):
                pass


if __name__ == '__main__': unittest.main()
