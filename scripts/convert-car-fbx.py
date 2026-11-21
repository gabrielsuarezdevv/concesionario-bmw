"""Run with Blender --background --factory-startup --disable-autoexec --python this_file -- ..."""
import argparse
import json
import sys
from pathlib import Path
import bpy

parser=argparse.ArgumentParser()
parser.add_argument('--input',required=True)
parser.add_argument('--textures',required=True)
parser.add_argument('--output',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
source=Path(args.input).resolve();textures_dir=Path(args.textures).resolve();output=Path(args.output).resolve()
if not source.is_file() or not textures_dir.is_dir():raise RuntimeError('Source FBX or texture directory missing')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(source),use_image_search=True)
files=[p for p in textures_dir.rglob('*') if p.suffix.lower() in ['.png','.jpg','.jpeg','.dds']]
textures={p.stem.lower():p for p in files}
textures.update({p.stem.lower():p for p in files if p.suffix.lower()=='.png'})
missing=[]
for image in bpy.data.images:
    if image.source!='FILE':continue
    name=Path(image.filepath.replace('\\','/')).stem.lower()
    candidate=textures.get(name) or textures.get(Path(image.name).stem.lower())
    if candidate:image.filepath=str(candidate);image.reload()
    if not image.packed_file and not image.has_data:missing.append(image.name)
if missing:raise RuntimeError('Missing texture images: '+', '.join(missing))
output.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_animations=False,
    export_cameras=False,export_lights=False,export_apply=True,export_image_format='AUTO')
print('Converted',source.name,'to',output)
