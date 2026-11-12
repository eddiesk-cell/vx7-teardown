import bpy, sys, bmesh
a = sys.argv[sys.argv.index('--') + 1:]
src, out, target = a[0], a[1], int(a[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
o = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]
bpy.context.view_layer.objects.active = o; o.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
parts = [x for x in bpy.context.scene.objects if x.type == 'MESH']
big = max(parts, key=lambda x: len(x.data.vertices))
drop = [x for x in parts if len(x.data.vertices) < 0.002 * len(big.data.vertices)]
print('loose parts', len(parts), 'dropped', len(drop))
for x in drop: bpy.data.objects.remove(x)
parts = [x for x in bpy.context.scene.objects if x.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for x in parts: x.select_set(True)
bpy.context.view_layer.objects.active = big; bpy.ops.object.join()
o = bpy.context.view_layer.objects.active
n = len(o.data.polygons)
m = o.modifiers.new('d', 'DECIMATE'); m.ratio = min(1, target / n); bpy.ops.object.modifier_apply(modifier='d')
print('faces', n, '->', len(o.data.polygons))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_materials='NONE')
