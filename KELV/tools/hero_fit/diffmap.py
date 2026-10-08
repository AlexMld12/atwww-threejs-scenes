import numpy as np, sys
from PIL import Image, ImageFilter
ours = sys.argv[1] if len(sys.argv) > 1 else 'tune_ours.png'
out = sys.argv[2] if len(sys.argv) > 2 else 'diffmap.png'
a=np.asarray(Image.open('tune_ref.png').convert('RGB')).astype(float)
b=np.asarray(Image.open(ours).convert('RGB')).astype(float)
la=a.mean(2); lb=b.mean(2)
d=np.asarray(Image.fromarray(((lb-la)/2+128).clip(0,255).astype(np.uint8)).filter(ImageFilter.BoxBlur(4))).astype(float)*2-256
img=np.zeros(a.shape)
img[...,0]=np.clip(d,0,80)/80*255; img[...,2]=np.clip(-d,0,80)/80*255
img=img*0.7+la[...,None]*0.3
w=a.shape[1]
c=Image.new('RGB',(w*3,a.shape[0])); c.paste(Image.fromarray(a.astype(np.uint8)),(0,0)); c.paste(Image.fromarray(b.astype(np.uint8)),(w,0)); c.paste(Image.fromarray(img.astype(np.uint8)),(2*w,0))
c.crop((0,0,w*3,1150)).resize((w*3//2,575)).save(out)
