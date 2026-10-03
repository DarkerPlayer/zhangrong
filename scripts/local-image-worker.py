"""One offline FLUX.2 edit request per process, followed by local cutout and rig calibration."""
import argparse
import gc
import json
from pathlib import Path
import resource
import subprocess
import sys
from PIL import Image, ImageOps, ImageStat
from local_image_lock import ImageOperationLock


def progress(phase, percent, message, **details):
    print(json.dumps({'type': 'progress', 'phase': phase, 'progress': percent, 'message': message, **details}, ensure_ascii=False), flush=True)


def prepare_references(references, output_directory):
    result = []
    for index, source in enumerate(references):
        with Image.open(source) as opened:
            opened.load()
            image = ImageOps.exif_transpose(opened).convert('RGBA')
            if image.width < 32 or image.height < 32:
                raise ValueError('参考图片太小，请使用边长至少 32 像素的图片')
            # Preserve each aspect ratio, cap area/tokens and longest side before VAE encoding.
            image.thumbnail((576, 576), Image.Resampling.LANCZOS)
            background = Image.new('RGB', image.size, 'white')
            background.paste(image, mask=image.getchannel('A'))
            target = output_directory / f'reference-{index}.png'
            background.save(target)
            result.append(str(target))
    return result


def refine_cutout(rendered, cutout):
    """Remove source-background color from the narrow, soft Vision boundary only."""
    import cv2
    import numpy as np
    rgb = np.asarray(rendered.convert('RGB'), dtype=np.float32)
    rgba = np.array(cutout.convert('RGBA'))
    alpha = rgba[:, :, 3].astype(np.float32) / 255
    foreground = cv2.erode((alpha >= .98).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    background = alpha <= .004
    if not foreground.any() or not background.any():
        return cutout.convert('RGBA')

    def nearest_colors(known):
        _, labels = cv2.distanceTransformWithLabels((~known).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        return rgb[known][labels - 1]

    foreground_rgb, background_rgb = nearest_colors(foreground), nearest_colors(background)
    direction = foreground_rgb - background_rgb
    contrast = np.sum(direction * direction, axis=2)
    opacity = np.clip(np.sum((rgb - background_rgb) * direction, axis=2) / np.maximum(contrast, 1), 0, 1)
    distance_inside = cv2.distanceTransform((alpha >= .5).astype(np.uint8), cv2.DIST_L2, 5)
    # Color estimates apply only near the silhouette. Low-contrast white garments retain Vision's matte.
    boundary = (alpha > 0) & ((alpha < .98) | (distance_inside <= 3)) & (contrast >= 30**2)
    refined_alpha = np.minimum(alpha, opacity)
    unmixed = (rgb - (1 - opacity[:, :, None]) * background_rgb) / np.maximum(opacity[:, :, None], .02)
    # Small alpha amplifies source noise; regularize uncertain colors to the nearby real foreground.
    trusted_rgb = np.clip(unmixed, foreground_rgb - 32, foreground_rgb + 32)
    confidence = np.clip((opacity - .08) / .35, 0, 1)[:, :, None]
    trusted_rgb = foreground_rgb * (1 - confidence) + trusted_rgb * confidence
    unmixed = np.where((opacity < .65)[:, :, None], trusted_rgb, unmixed)
    rgba[:, :, :3][boundary] = np.rint(np.clip(unmixed, 0, 255)).astype(np.uint8)[boundary]
    rgba[:, :, 3][boundary] = np.rint(refined_alpha * 255).astype(np.uint8)[boundary]
    rgba[rgba[:, :, 3] <= 3] = 0
    return Image.fromarray(rgba)


def build_rig(image, landmarks):
    face, eyes, mouth = landmarks.get('face', {}), landmarks.get('eyes', []), landmarks.get('mouth', {})
    if len(eyes) != 2 or not all(set(('x', 'y', 'rx', 'ry')).issubset(part) for part in [*eyes, mouth]) or not set(('left', 'right', 'top', 'bottom')).issubset(face):
        raise ValueError('面部定位不完整，请改用清晰正脸参考图后重试')
    bounds = image.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
    if not bounds:
        raise ValueError('人物抠图为空，请使用简单背景后重试')
    width, height = image.size
    def color(x, y, radius=2):
        px, py = max(0, min(width - 1, round(x * width))), max(0, min(height - 1, round(y * height)))
        patch = image.convert('RGB').crop((max(0, px - radius), max(0, py - radius), min(width, px + radius + 1), min(height, py + radius + 1)))
        return [round(v / 255, 4) for v in ImageStat.Stat(patch).median]
    calibrated_eyes = []
    for eye in sorted(eyes, key=lambda e: e['x']):
        rx, ry = max(.002, eye['rx'] * 1.65), max(.0037, eye['ry'] * 1.55)
        calibrated_eyes.append({**eye, 'rx': rx, 'ry': ry, 'skin': color(eye['x'], eye['y'] + ry * 2.3), 'lid': [.19, .105, .12]})
    face_width, face_height = face['right'] - face['left'], face['bottom'] - face['top']
    center_x = (face['left'] + face['right']) / 2
    neck_y = min(.9, face['bottom'] + face_height * .18)
    shoulder_y = min(.95, neck_y + face_height * .22)
    shoulder_half = min(.25, max(.10, face_width * 1.15))
    normalized_bounds = dict(zip(('left', 'top', 'right', 'bottom'), (bounds[0] / width, bounds[1] / height, bounds[2] / width, bounds[3] / height)))
    return {'armMobility': 0,
        'head': {'x': center_x, 'y': (face['top'] + face['bottom']) / 2, 'neckY': neck_y, 'radiusX': max(.055, face_width * .85), 'radiusY': max(.035, face_height * .68)},
        'eyes': calibrated_eyes,
        'mouth': {**mouth, 'rx': max(.002, mouth['rx'] * 1.02), 'ry': max(.0047, mouth['ry']), 'skin': color(mouth['x'], mouth['y'] + mouth['ry'] * 2.1), 'lip': color(mouth['x'], mouth['y'] + mouth['ry'] * .65, 1), 'inner': [.22, .05, .075]},
        'shoulders': {'left': [max(normalized_bounds['left'], center_x - shoulder_half), shoulder_y], 'right': [min(normalized_bounds['right'], center_x + shoulder_half), shoulder_y]},
        'bounds': normalized_bounds}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--request', required=True)
    args = parser.parse_args()
    request = json.loads(Path(args.request).read_text(encoding='utf8'))
    operation_directory = request.get('operationDirectory') or str(Path(request['modelPath']).resolve().parent)
    with ImageOperationLock(operation_directory, 'generate'):
        return generate(request)


def generate(request):
    output_directory = Path(request['outputDirectory']).resolve()
    prepared = prepare_references(request['references'], output_directory)
    progress('loading', 4, '按需加载本地 4 位量化模型')
    import mlx.core as mx
    from mflux.models.common.config import ModelConfig
    from mflux.models.common.vae import TilingConfig
    from mflux.models.flux2.variants import Flux2KleinEdit
    from mflux.callbacks.instances.memory_saver import MemorySaver
    mx.set_cache_limit(512 * 1024 * 1024)
    mx.set_memory_limit(10 * 1024 * 1024 * 1024)
    model = Flux2KleinEdit(model_config=ModelConfig.flux2_klein_4b(), model_path=request['modelPath'])
    # Explicitly supported by MFLUX 0.20; 8 latent-pixel overlap = 64 image pixels.
    # Flux2 opts out of implicit tiling because tile GroupNorm can shift colors slightly.
    model.tiling_config = TilingConfig(vae_decode_tiles_per_dim=2, vae_decode_tile_size=512, vae_decode_overlap=8,
        vae_encode_tiled=True, vae_encode_tile_size=512, vae_encode_tile_overlap=64)
    model.callbacks.register(MemorySaver(model, keep_transformer=False, cache_limit_bytes=512 * 1024 * 1024, num_seeds=1))
    class JobProgress:
        def call_before_loop(self, **kwargs):
            progress('denoise', 20, '参考图已编码，开始生成')
        def call_in_loop(self, t, latents, **kwargs):
            mx.eval(latents)
            progress('denoise', 20 + (int(t) + 1) / 4 * 55, f'生成步骤 {int(t) + 1} / 4', peakMemoryBytes=mx.get_peak_memory())
        def call_after_loop(self, **kwargs):
            progress('decode', 78, '分块解码图片，降低内存占用')
    model.callbacks.register(JobProgress())
    image = model.generate_image(seed=request['seed'], prompt=request['prompt'], num_inference_steps=4,
        width=request['width'], height=request['height'], image_paths=prepared, guidance=1.0)
    rendered = output_directory / 'render.png'
    image.save(str(rendered))
    peak = mx.get_peak_memory()
    del image, model
    gc.collect()
    mx.clear_cache()
    progress('calibrate', 86, '本地抠图并定位眼睛、嘴巴', peakMemoryBytes=peak)
    asset = output_directory / 'character.png'
    landmarks_file = output_directory / 'landmarks.json'
    subprocess.run([request['calibratorPath'], str(rendered), str(asset), str(landmarks_file)], check=True, capture_output=True, text=True)
    with Image.open(rendered) as source, Image.open(asset) as cutout:
        refined = refine_cutout(source, cutout)
    refined.save(asset)
    rig = build_rig(refined, json.loads(landmarks_file.read_text(encoding='utf8')))
    width, height = refined.size
    rig_path = output_directory / 'rig.json'
    rig_path.write_text(json.dumps(rig, ensure_ascii=False, indent=2), encoding='utf8')
    for prepared_path in prepared:
        Path(prepared_path).unlink(missing_ok=True)
    progress('complete', 100, '生成完成，可预览并保存到角色或衣橱', peakMemoryBytes=peak)
    print(json.dumps({'type': 'result', 'assetPath': str(asset), 'rigPath': str(rig_path), 'width': width, 'height': height,
        'peakMemoryBytes': peak, 'maxRssBytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        'warnings': ['肩膀位置自动估算，请预览确认人物动作。', '为降低内存使用了分块解码，可能存在轻微色差。']}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        print(json.dumps({'type': 'error', 'message': (error.stderr or str(error)).strip()}, ensure_ascii=False), flush=True)
        sys.exit(1)
    except Exception as error:
        print(json.dumps({'type': 'error', 'message': str(error)}, ensure_ascii=False), flush=True)
        sys.exit(1)
