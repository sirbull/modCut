/** Shift+Eyedropper samples the displayed pixel, including gradients, images and transparency. */
export function createEyedropperPreview(canvas,{active,current}) {
  const controller=new AbortController(),events={signal:controller.signal};
  const ring=document.createElement('div');ring.className='draw-eyedropper-preview';ring.hidden=true;ring.setAttribute('aria-hidden','true');
  document.body.append(ring);
  const backdrop=document.createElement('canvas');backdrop.width=backdrop.height=1;
  const context=backdrop.getContext('2d',{willReadFrequently:true});
  let pointer=null,shift=false,baseline=null;
  function sample(event) {
    const box=canvas.getBoundingClientRect();
    if(box.width<=0||box.height<=0||event.clientX<box.left||event.clientX>=box.right||event.clientY<box.top||event.clientY>=box.bottom)return null;
    const x=Math.floor((event.clientX-box.left)*canvas.width/box.width),y=Math.floor((event.clientY-box.top)*canvas.height/box.height);
    try {
      let [r,g,b,a]=canvas.getContext('2d').getImageData(x,y,1,1).data;
      if(a<255){
        // Paper's canvas is transparent outside the artboards; include the visible pasteboard colour.
        context.clearRect(0,0,1,1);context.fillStyle=getComputedStyle(canvas.parentElement).backgroundColor;context.fillRect(0,0,1,1);
        context.fillStyle=`rgba(${r},${g},${b},${a/255})`;context.fillRect(0,0,1,1);
        [r,g,b,a]=context.getImageData(0,0,1,1).data;
      }
      return a?'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase():null;
    }catch{return null;}
  }
  function hide(){ring.hidden=true;baseline=null;}
  function refresh() {
    if(!active()||!shift||!pointer||document.querySelector('.modal-overlay')){hide();return;}
    const hex=sample(pointer);if(!hex){hide();return;}
    if(ring.hidden)baseline=current();
    ring.style.left=`${pointer.clientX}px`;ring.style.top=`${pointer.clientY}px`;
    ring.style.setProperty('--sampled-color',hex);ring.style.setProperty('--current-color',baseline||'transparent');
    ring.dataset.sampledColor=hex;ring.dataset.currentColor=baseline||'';ring.hidden=false;
  }
  function move(event){pointer={clientX:event.clientX,clientY:event.clientY};shift=event.shiftKey;refresh();}
  function leave(){pointer=null;hide();}
  function modifiers(event){shift=event.shiftKey;refresh();}
  canvas.addEventListener('pointermove',move,events);canvas.addEventListener('pointerdown',move,events);
  canvas.addEventListener('pointerleave',leave,events);canvas.addEventListener('pointercancel',leave,events);
  window.addEventListener('blur',()=>{shift=false;leave();},events);
  return {sample,refresh,modifiers,destroy(){controller.abort();ring.remove();}};
}
