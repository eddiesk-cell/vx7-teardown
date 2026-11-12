import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
src, out, target = a[0], a[1], int(a[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
o = [x for x in bpy.context.scene.objects if x.type == 'MESH'][0]
bpy.context.view_layer.objects.active = o; o.select_set(True)
n = len(o.data.polygons)
m = o.modifiers.new('d', 'DECIMATE'); m.ratio = min(1, target / n); m.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier='d')
for mat in o.data.materials:
    for nd in mat.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image:
            im = nd.image; print('texture', im.size[:], im.name)
            if im.size[0] > 2048: im.scale(2048, 2048)
[setattr(p,'use_smooth',True) for p in o.data.polygons]; print('faces', n, '->', len(o.data.polygons))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=86, export_texcoords=True, export_normals=False, export_tangents=False, export_apply=True)
