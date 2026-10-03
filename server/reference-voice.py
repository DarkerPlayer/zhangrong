"""Private local TTS worker: JSON lines over pipes; never opens a network port."""
import base64
import io
import json
import os
from pathlib import Path
import sys
import queue
import threading
import time

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
protocol = sys.stdout
sys.stdout = sys.stderr
parent = os.getppid()

def parent_watch():
    while True:
        time.sleep(2)
        if os.getppid() != parent:
            os._exit(0)

threading.Thread(target=parent_watch, daemon=True).start()
import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model
from reference_cache import ReferenceCache

root = Path(sys.argv[1]).resolve()
default_reference_root = Path(sys.argv[2]).resolve() if len(sys.argv)>2 else root
model = load_model(str(root / 'model'))

def load_reference(reference_root):
    profile = json.loads((reference_root / 'profile.json').read_text())
    reference, rate = sf.read(reference_root / 'reference.wav', dtype='float32')
    if rate != model.sample_rate:
        raise ValueError('Reference sample rate must match model')
    return profile, mx.array(reference)

references = ReferenceCache(model, load_reference, capacity=3)

# Keep a small allocator cache and compiled kernels warm across utterances.
mx.set_cache_limit(128 * 1024 * 1024)

def emit(value):
    protocol.write(json.dumps(value) + '\n')
    protocol.flush()

def wav(audio):
    if not len(audio) or not np.isfinite(audio).all():
        raise ValueError('empty audio')
    output = io.BytesIO()
    sf.write(output, audio, model.sample_rate, format='WAV', subtype='PCM_16')
    return base64.b64encode(output.getvalue()).decode('ascii')

requests = queue.Queue()
cancellations = {}
def read_requests():
    for line in sys.stdin:
        request = json.loads(line)
        if 'cancel' in request:
            event = cancellations.get(request['cancel'])
            if event is not None:
                event.set()
        else:
            event = threading.Event()
            cancellations[request['id']] = event
            requests.put((request, event))
    requests.put(None)
threading.Thread(target=read_requests, daemon=True).start()
while True:
    entry = requests.get()
    if entry is None:
        break
    request, cancel = entry
    try:
        if cancel.is_set():
            emit({'id':request['id'], 'cancelled':True})
            continue
        warming = request.get('operation') == 'warmup'
        text = '你好。' if warming else request['text'].strip()
        if not text or len(text) > 1500:
            raise ValueError('invalid text length')
        streaming = request.get('stream', False)
        profile, reference = references.select(request.get('voiceRoot') or default_reference_root)
        mx.random.seed(42)
        chunks = []
        for result in model.generate(
            text=text, ref_audio=reference, ref_text=profile['referenceText'],
            lang_code='Chinese', temperature=0.65, top_p=0.9,
            stream=True, streaming_interval=0.48,
            max_tokens=min(4096, max(256, len(text) * 18)), verbose=False):
            if cancel.is_set():
                break
            audio = np.asarray(result.audio)
            if warming:
                continue
            if streaming:
                emit({'id':request['id'], 'chunk':True, 'audio':wav(audio)})
            else:
                chunks.append(audio)
        if cancel.is_set():
            emit({'id':request['id'], 'cancelled':True})
        elif warming:
            emit({'id':request['id'], 'ready':True})
        elif streaming:
            emit({'id':request['id'], 'done':True})
        else:
            emit({'id':request['id'], 'audio':wav(np.concatenate(chunks))})
    except Exception:
        emit({'id':request.get('id'), 'error':'synthesis_failed'})
    finally:
        cancellations.pop(request['id'], None)
