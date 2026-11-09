// ============================================================
// 水彩后处理：湿纸晕染扭曲、颜料边缘沉积、柔和描边、纸纹、色调分级、暖色暗角
// ============================================================
import * as THREE from 'three';

export class WatercolorPost {
  constructor(renderer) {
    this.renderer = renderer;
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(s.x, s.y, { type: THREE.HalfFloatType, samples: 4 });
    this.rt.depthTexture = new THREE.DepthTexture(s.x, s.y);
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.uniforms = {
      tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture },
      uRes: { value: s.clone() }, uTime: { value: 0 }, uNear: { value: 0.3 }, uFar: { value: 12000 },
      uTint: { value: new THREE.Color(1, 1, 1) }, uStrength: { value: 1 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, depthTest: false, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor, tDepth; uniform vec2 uRes; uniform float uTime, uNear, uFar, uStrength; uniform vec3 uTint;
        varying vec2 vUv;
        float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.07; a*=0.5; } return s; }
        float lin(vec2 uv){ float d = texture2D(tDepth, uv).x; float z = d*2.0-1.0; return (2.0*uNear*uFar)/(uFar+uNear - z*(uFar-uNear)); }
        void main(){
          vec2 px = 1.0 / uRes;
          vec2 asp = vec2(uRes.x/uRes.y, 1.0);
          // 湿纸扭曲
          vec2 wob = (vec2(fbm(vUv*asp*5.0 + 3.1), fbm(vUv*asp*5.0 - 7.7)) - 0.5) * 0.0028 * uStrength;
          vec2 uv = vUv + wob;
          vec3 c = texture2D(tColor, uv).rgb;
          // 颜料晕开（小范围柔化）
          vec3 b1 = texture2D(tColor, uv + px*vec2( 1.5, 0.6)).rgb;
          vec3 b2 = texture2D(tColor, uv + px*vec2(-1.5,-0.6)).rgb;
          vec3 b3 = texture2D(tColor, uv + px*vec2(-0.6, 1.5)).rgb;
          vec3 b4 = texture2D(tColor, uv + px*vec2( 0.6,-1.5)).rgb;
          vec3 blur = (b1+b2+b3+b4)*0.25;
          c = mix(c, blur, 0.35);
          // 深度描边（像钢笔淡彩的轮廓）
          float d0 = lin(uv);
          float e = abs(d0 - lin(uv + vec2(px.x,0))) + abs(d0 - lin(uv - vec2(px.x,0)))
                  + abs(d0 - lin(uv + vec2(0,px.y))) + abs(d0 - lin(uv - vec2(0,px.y)));
          float edge = smoothstep(0.03, 0.2, e / d0) * (1.0 - smoothstep(250.0, 1600.0, d0));
          // 颜料边缘沉积：色块交界处颜色更深
          float pool = clamp(length(c - blur) * 3.0, 0.0, 1.0);
          vec3 ink = c * vec3(0.52, 0.5, 0.62);
          c = mix(c, ink, clamp(edge*0.6 + pool*0.25, 0.0, 0.7) * uStrength);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          vec3 col = gl_FragColor.rgb;
          float l = dot(col, vec3(0.299,0.587,0.114));
          col = mix(vec3(l), col, 0.9);                                         // 轻微去饱和，更克制
          col = mix(col, col*vec3(0.9,0.9,1.05) + vec3(0.03,0.03,0.06), (1.0-l)*0.4); // 暗部偏淡紫
          col *= uTint;
          // 纸纹：大尺度起伏 + 细纤维
          vec2 q = vUv * uRes;
          float paper = fbm(q/220.0)*0.55 + noise(q/2.5)*0.25 + noise(vec2(q.x/1.2, q.y/9.0))*0.2;
          col *= 0.93 + paper*0.1;
          col -= (noise(q/1.7) - 0.5) * 0.035 * (1.0 - l);                     // 暗部颗粒
          // 暖色暗角
          vec2 v2 = vUv - 0.5;
          float vig = smoothstep(0.9, 0.3, length(v2*vec2(1.1, 1.0)));
          col *= mix(vec3(0.84, 0.78, 0.76), vec3(1.0), vig);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  setSize() {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(s.x, s.y);
    this.uniforms.uRes.value.copy(s);
  }
  render(scene, camera, t) {
    this.uniforms.uTime.value = t;
    this.uniforms.uNear.value = camera.near; this.uniforms.uFar.value = camera.far;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.ortho);
  }
}
