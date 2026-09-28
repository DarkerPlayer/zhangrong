"""Offline transcript extraction for a user-selected short voice reference."""
import os, sys, json
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
protocol=sys.stdout
sys.stdout=sys.stderr
from mlx_audio.stt.utils import load_model
model=load_model(sys.argv[1])
result=model.generate(sys.argv[2],language='Chinese',max_tokens=512)
protocol.write(json.dumps({'text':result.text},ensure_ascii=False))
