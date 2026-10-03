import importlib.util
from pathlib import Path
import tempfile
import unittest
import sys
from PIL import Image
import numpy as np

spec = importlib.util.spec_from_file_location('local_image_worker', Path(__file__).parents[1] / 'scripts/local-image-worker.py')
sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class ImagePreparationTests(unittest.TestCase):
    def test_soft_matte_edges_remove_light_background_contamination(self):
        import cv2
        mask = np.zeros((64, 64), dtype=np.uint8)
        cv2.circle(mask, (32, 32), 20, 255, -1)
        true_alpha = cv2.GaussianBlur(mask.astype(np.float32) / 255, (5, 5), .6)
        vision_alpha = cv2.GaussianBlur(mask.astype(np.float32) / 255, (9, 9), 1.6)
        foreground = np.array([10., 25., 55.])
        background = np.array([225., 225., 225.])
        rendered = np.rint(foreground * true_alpha[:, :, None] + background * (1 - true_alpha[:, :, None])).astype(np.uint8)
        cutout = Image.fromarray(np.dstack((rendered, np.rint(vision_alpha * 255).astype(np.uint8))))
        refined = np.array(worker.refine_cutout(Image.fromarray(rendered), cutout))
        before = rendered * vision_alpha[:, :, None]
        after = refined[:, :, :3] * (refined[:, :, 3:4] / 255)
        expected = foreground * true_alpha[:, :, None]
        before_error, after_error = np.abs(before - expected).mean(), np.abs(after - expected).mean()
        self.assertLess(after_error, before_error * .5)

    def test_matte_refinement_preserves_opaque_white_clothing_inside(self):
        rendered = Image.new('RGB', (64, 64), (220, 220, 220))
        cutout = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        for y in range(15, 49):
            for x in range(20, 44):
                rendered.putpixel((x, y), (250, 250, 250))
                cutout.putpixel((x, y), (250, 250, 250, 255))
        refined = worker.refine_cutout(rendered, cutout)
        self.assertEqual(refined.getpixel((32, 32)), (250, 250, 250, 255))
        self.assertEqual(refined.getpixel((0, 0)), (0, 0, 0, 0))

    def test_matte_refinement_does_not_amplify_edge_noise_into_saturated_colors(self):
        import cv2
        mask = np.zeros((64, 64), dtype=np.uint8)
        cv2.circle(mask, (32, 32), 20, 255, -1)
        true_alpha = cv2.GaussianBlur(mask.astype(np.float32) / 255, (5, 5), .6)
        vision_alpha = cv2.GaussianBlur(mask.astype(np.float32) / 255, (9, 9), 1.6)
        foreground, background = np.array([100., 80., 65.]), np.array([220., 220., 220.])
        rendered = foreground * true_alpha[:, :, None] + background * (1 - true_alpha[:, :, None])
        noisy = (true_alpha > .01) & (true_alpha < .3)
        rendered[noisy] += np.array([-10., 12., -2.])
        rendered = np.rint(np.clip(rendered, 0, 255)).astype(np.uint8)
        cutout = Image.fromarray(np.dstack((rendered, np.rint(vision_alpha * 255).astype(np.uint8))))
        refined = np.array(worker.refine_cutout(Image.fromarray(rendered), cutout))
        soft_edge = (refined[:, :, 3] > 3) & (refined[:, :, 3] < 96)
        self.assertTrue(soft_edge.any())
        self.assertLess(np.abs(refined[:, :, :3][soft_edge] - foreground).max(), 50)

    def test_reference_resize_preserves_aspect_and_composites_transparency(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'reference.png'
            Image.new('RGBA', (1024, 1536), (30, 80, 130, 0)).save(source)
            results = worker.prepare_references([str(source)], root)
            image = Image.open(results[0])
            self.assertEqual(image.size, (384, 576))
            self.assertEqual(image.mode, 'RGB')
            self.assertEqual(image.getpixel((0, 0)), (255, 255, 255))

    def test_rig_requires_detected_eyes_and_lips(self):
        image = Image.new('RGBA', (512, 768), (200, 150, 130, 255))
        with self.assertRaisesRegex(ValueError, '面部'):
            worker.build_rig(image, {'face': {}, 'eyes': [], 'mouth': {}})

    def test_rig_is_normalized_and_samples_source_colors(self):
        image = Image.new('RGBA', (512, 768), (200, 150, 130, 255))
        landmarks = {'face': {'left': .43, 'right': .57, 'top': .04, 'bottom': .18},
                     'eyes': [{'x': .47, 'y': .095, 'rx': .015, 'ry': .005}, {'x': .53, 'y': .095, 'rx': .015, 'ry': .005}],
                     'mouth': {'x': .5, 'y': .145, 'rx': .015, 'ry': .008}}
        rig = worker.build_rig(image, landmarks)
        self.assertEqual(rig['armMobility'], 0)
        self.assertEqual(len(rig['eyes']), 2)
        self.assertAlmostEqual(rig['eyes'][0]['rx'], .015 * 1.65)
        self.assertEqual(rig['head']['x'], .5)
        self.assertAlmostEqual(rig['eyes'][0]['skin'][0], 200 / 255, places=4)
        self.assertGreater(rig['head']['neckY'], rig['mouth']['y'])
        self.assertLess(rig['shoulders']['left'][0], rig['shoulders']['right'][0])
        self.assertEqual(rig['bounds']['bottom'], 1)


if __name__ == '__main__':
    unittest.main()
