import * as THREE from 'three';
import { BVHShaderGLSL, FloatVertexAttributeTexture, MeshBVH, MeshBVHUniformStruct } from 'three-mesh-bvh';
import { leavesShadow, WALL_HEIGHT, WALL_WIDTH } from './backdrop';
import { BACKDROP, GLASS } from './config';
import { isHandheld } from '@/lib/device';
import { bindViewCurve } from './view-curve';

/**
 * Glass ray-traced through the logo's own triangles, as Cycles does: reflection of the studio at the surface,
 * refraction in, then reflections between the walls, each letting part of the light out into the scene.
 */
const glassFragment = /* glsl */ `
  #include <common>
  precision highp isampler2D;
  precision highp usampler2D;
  ${BVHShaderGLSL.common_functions}
  ${BVHShaderGLSL.bvh_struct_definitions}
  ${BVHShaderGLSL.bvh_ray_functions}

  uniform mat4 projectionMatrix;
  uniform BVH bvh;
  uniform sampler2D normals;
  uniform mat4 worldToLogo;
  uniform samplerCube reflections;
  uniform sampler2D behind;
  uniform sampler2D backdropMap;
  uniform sampler2D leavesMap;
  uniform float backdropGain;
  uniform float backdropZ;
  uniform vec2 backdropSize;
  uniform float ior;
  uniform vec3 tint;
  uniform float opacity;
  uniform float wallThrough;
  uniform vec3 mask;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;

  ${isHandheld() ? '#define FEW_BOUNCES' : ''}
  const int BOUNCES = ${isHandheld() ? GLASS.handheldBounces : GLASS.traceBounces};
  // Start each ray a little off the surface it leaves, or it finds that same surface again.
  const float SURFACE_OFFSET = 2e-3;

  float fresnel( float cosTheta ) {
    float f0 = pow( ( ior - 1.0 ) / ( ior + 1.0 ), 2.0 );
    return f0 + ( 1.0 - f0 ) * pow( 1.0 - clamp( cosTheta, 0.0, 1.0 ), 5.0 );
  }

  // What a ray sees once it is out of the glass. Through glass Cycles' rays stay "glossy", so the world shows them
  // the studio HDR; the leaf wall comes from its render, with the paintings over it where it is on screen.
  vec3 sceneAlong( vec3 origin, vec3 direction ) {
    vec3 studio = textureCube( reflections, direction ).rgb;
    if ( direction.z > -1e-4 ) return studio;
    vec3 wall = origin + direction * ( ( backdropZ - origin.z ) / direction.z );
    if ( any( greaterThan( abs( wall.xy ), backdropSize * 0.5 ) ) ) return studio;
    vec2 wallUv = wall.xy / backdropSize + 0.5;
    vec3 wallColor = texture2D( backdropMap, wallUv ).rgb * backdropGain * ${leavesShadow('leavesMap', 'wallUv')};
    vec4 clip = projectionMatrix * viewMatrix * vec4( wall, 1.0 );
    vec2 screen = clip.xy / clip.w * 0.5 + 0.5;
    if ( all( greaterThanEqual( screen, vec2( 0.0 ) ) ) && all( lessThanEqual( screen, vec2( 1.0 ) ) ) ) {
      // Before the wall is revealed the screen behind is bare paper; the glass already shows the lit wall through
      // it (wallThrough), which is what makes it read as glass and not as a drawing.
      return mix( texture2D( behind, screen ).rgb, wallColor, wallThrough );
    }
    return wallColor;
  }

  bool hitLogo( vec3 origin, vec3 direction, out vec3 point, out vec3 normal ) {
    vec3 localOrigin = ( worldToLogo * vec4( origin, 1.0 ) ).xyz;
    vec3 localDirection = ( worldToLogo * vec4( direction, 0.0 ) ).xyz;
    uvec4 faceIndices = uvec4( 0u );
    vec3 faceNormal = vec3( 0.0 );
    vec3 barycoord = vec3( 0.0 );
    float side = 1.0;
    float dist = 0.0;
    if ( ! bvhIntersectFirstHit( bvh, localOrigin, localDirection, faceIndices, faceNormal, barycoord, side, dist ) ) {
      return false;
    }
    // Parametric distance: the same along the world ray, whatever the logo's scale.
    point = origin + direction * dist;
    vec3 localNormal = textureSampleBarycoord( normals, barycoord, faceIndices.xyz ).xyz;
    normal = normalize( transpose( mat3( worldToLogo ) ) * localNormal );
    return true;
  }

  // At every wall the ray meets from inside, the share that gets out (1 − Fresnel) is added with what it sees,
  // and the reflected share carries on inside, as Cycles' paths do on average.
  vec3 traceThrough( vec3 origin, vec3 direction ) {
    vec3 weight = tint;
    vec3 color = vec3( 0.0 );
    for ( int i = 0; i < BOUNCES; i++ ) {
      vec3 point;
      vec3 normal;
      if ( ! hitLogo( origin + direction * SURFACE_OFFSET, direction, point, normal ) ) {
        return color + weight * sceneAlong( origin, direction );
      }
      vec3 leaving = refract( direction, -normal, ior );
      if ( dot( leaving, leaving ) > 0.0 ) {
        float reflectance = fresnel( dot( leaving, normal ) );
        color += weight * tint * ( 1.0 - reflectance ) * sceneAlong( point, normalize( leaving ) );
        weight *= reflectance;
      }
      direction = reflect( direction, -normal );
      origin = point;
    }
    #ifdef FEW_BOUNCES
    // the light still inside after the last surface traced (a phone's few) leaves where the ray points, not lost:
    // without it those paths are black
    return color + weight * sceneAlong( origin, direction );
    #else
    return color;
    #endif
  }

  void main() {
    vec3 normal = normalize( vWorldNormal );
    vec3 toCamera = normalize( cameraPosition - vWorldPosition );
    float reflectance = fresnel( dot( normal, toCamera ) );
    vec3 color = reflectance * textureCube( reflections, reflect( -toCamera, normal ) ).rgb;
    color += ( 1.0 - reflectance ) * traceThrough( vWorldPosition, refract( -toCamera, normal, 1.0 / ior ) );
    // The preloader's disc, in drawing-buffer px (x, y, radius), with a pixel of antialiasing.
    float inMask = clamp( mask.z - distance( gl_FragCoord.xy, mask.xy ) + 0.5, 0.0, 1.0 );
    gl_FragColor = vec4( color, opacity * inMask );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// a phone's glass, drawn this many times a second (the rest of the scene at the screen's rate)
const SNAPSHOT_HZ = 3;

export function createGlass(
  renderer: THREE.WebGLRenderer,
  geometry: THREE.BufferGeometry,
  reflections: THREE.CubeTexture,
  backdropMap: THREE.Texture,
  leavesMap: THREE.Texture,
) {
  const bvh = new MeshBVHUniformStruct();
  bvh.updateFrom(new MeshBVH(geometry));
  const normals = new FloatVertexAttributeTexture();
  normals.updateFrom(geometry.getAttribute('normal') as THREE.BufferAttribute);

  const behind = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });

  const material = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      bvh: { value: bvh },
      normals: { value: normals },
      worldToLogo: { value: new THREE.Matrix4() },
      reflections: { value: reflections },
      behind: { value: behind.texture },
      backdropMap: { value: backdropMap },
      leavesMap: { value: leavesMap },
      backdropGain: { value: BACKDROP.gain },
      backdropZ: { value: -BACKDROP.distance },
      backdropSize: { value: new THREE.Vector2(WALL_WIDTH, WALL_HEIGHT) },
      ior: { value: GLASS.ior },
      // Two refractions per path; matched to the Cycles render, each gets ⁴√ of Blender's colour.
      tint: { value: new THREE.Vector3(...GLASS.color.map((c) => c ** 0.25)) },
      opacity: { value: 1 },
      wallThrough: { value: 0 },
      mask: { value: new THREE.Vector3(0, 0, 1e6) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize( mat3( transpose( inverse( modelMatrix ) ) ) * normal );
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }`,
    fragmentShader: glassFragment,
  });
  bindViewCurve(material);

  const size = new THREE.Vector2();
  const full = new THREE.Vector2();
  const handheld = isHandheld();

  // A phone: the glass is drawn into its own picture SNAPSHOT_HZ times a second (with what it sees behind it), and
  // every frame shows that picture over the scene; the tube and the wall keep the screen's rate. Before the logo has
  // settled (the preloader's disc, the intro's tilt) it is drawn every frame.
  const snapshot = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const overlayMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { glassPicture: { value: snapshot.texture } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    // the picture holds the glass premultiplied, in scene light: back to straight colour, then the view curve
    fragmentShader: /* glsl */ `
      uniform sampler2D glassPicture;
      varying vec2 vUv;
      void main() {
        vec4 glass = texture2D( glassPicture, vUv );
        gl_FragColor = vec4( glass.rgb / max( glass.a, 1e-4 ), glass.a );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  bindViewCurve(overlayMaterial);
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), overlayMaterial);
  overlay.frustumCulled = false;
  const overlayScene = new THREE.Scene();
  overlayScene.add(overlay);
  const overlayCamera = new THREE.Camera();
  let snapshotAt = -Infinity;

  return {
    material,
    setOpacity(value: number) {
      material.uniforms.opacity.value = value;
    },
    /** How much the rays see the lit wall itself rather than the screen behind (1 until the wall is revealed). */
    setWallThrough(value: number) {
      material.uniforms.wallThrough.value = value;
    },
    /** Clips the glass to a disc given in client px; `null` shows all of it. */
    setMask(disc: { x: number; y: number; radius: number } | null, canvas: HTMLCanvasElement) {
      if (!disc) {
        material.uniforms.mask.value.set(0, 0, 1e6);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const scale = renderer.getPixelRatio();
      material.uniforms.mask.value.set(
        (disc.x - rect.left) * scale,
        (rect.bottom - disc.y) * scale,
        disc.radius * scale,
      );
    },
    /** The backdrop plane is scaled to cover the screen; the texture the rays read is scaled with it. */
    setBackdropScale(scale: number) {
      material.uniforms.backdropSize.value.set(WALL_WIDTH * scale, WALL_HEIGHT * scale);
    },
    /** Draws the scene without the logo (what the rays leaving the glass see), then the whole frame. */
    /** `live`: the glass drawn this frame on a phone too (the logo not settled yet). */
    render(
      scene: THREE.Scene,
      camera: THREE.PerspectiveCamera,
      logo: THREE.Mesh,
      hidden: THREE.Object3D[],
      live = true,
    ) {
      renderer.getDrawingBufferSize(full);
      size.copy(full);
      // on a phone what the refraction sees, blurred by the glass anyway, at half the screen's pixels each way
      if (handheld) size.multiplyScalar(0.5).floor();
      const resized = behind.width !== size.x || behind.height !== size.y;
      if (resized) behind.setSize(size.x, size.y);

      const now = performance.now();
      const redraw = !handheld || live || resized || now - snapshotAt >= 1000 / SNAPSHOT_HZ;
      if (redraw) {
        snapshotAt = now;
        logo.updateWorldMatrix(true, false);
        material.uniforms.worldToLogo.value.copy(logo.matrixWorld).invert();
        const shown = hidden.map((object) => object.visible);
        hidden.forEach((object) => (object.visible = false));
        renderer.setRenderTarget(behind);
        renderer.clear();
        renderer.render(scene, camera);
        hidden.forEach((object, i) => (object.visible = shown[i]));
      }

      if (!handheld) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
      }

      // the glass alone into its picture: every other part of the scene hidden for that pass
      if (redraw) {
        if (snapshot.width !== full.x || snapshot.height !== full.y) snapshot.setSize(full.x, full.y);
        const others = scene.children.map((child) => child.visible);
        scene.children.forEach((child) => (child.visible = child.getObjectById(logo.id) !== undefined));
        const background = scene.background;
        scene.background = null;
        const clearColor = renderer.getClearColor(new THREE.Color());
        const clearAlpha = renderer.getClearAlpha();
        renderer.setRenderTarget(snapshot);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.setClearColor(clearColor, clearAlpha);
        scene.background = background;
        scene.children.forEach((child, i) => (child.visible = others[i]));
      }
      // the frame: the scene without the glass, then its picture over it
      const logoShown = logo.visible;
      logo.visible = false;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      logo.visible = logoShown;
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(overlayScene, overlayCamera);
      renderer.autoClear = autoClear;
    },
    dispose() {
      behind.dispose();
      snapshot.dispose();
      overlayMaterial.dispose();
      overlay.geometry.dispose();
      bvh.dispose();
      normals.dispose();
      material.dispose();
    },
  };
}
