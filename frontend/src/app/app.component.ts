import { Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CurrencyPipe } from '@angular/common';
import { timeout } from 'rxjs';
import { toDataURL } from 'qrcode';
import { CheckoutView, orderEmailMessage } from './checkout';
import { OrderCheckoutComponent } from './order-checkout.component';
import { CarViewerComponent } from './car-viewer.component';
import { Catalog, DEMO_CATALOG, Option } from './catalog';

@Component({ selector: 'app-root', standalone: true, imports: [CarViewerComponent, CurrencyPipe, OrderCheckoutComponent], templateUrl: './app.component.html' })
export class AppComponent implements OnDestroy {
  readonly checkoutToken = new URLSearchParams(location.search).has('checkout') ? new URLSearchParams(location.search).get('checkout')! : null;
  checkout=signal<CheckoutView|null>(null); qrImage=signal(''); checkoutLink=signal(''); buying=signal(false); purchaseError=signal('');
  readonly emailMessage=orderEmailMessage;
  private checkoutPoll?:ReturnType<typeof setTimeout>;
  private destroyed=false;
  private checkoutRequestId=0;
  @ViewChild('summary') summary!: ElementRef<HTMLDialogElement>;
  private http=inject(HttpClient);
  catalog=signal<Catalog>(DEMO_CATALOG);
  model=signal('m4'); paint=signal('blue'); wheels=signal('sport'); interior=signal('black');
  activePart=signal('paint'); view=signal('exterior'); exploded=signal(false); autoRotate=signal(false); resetKey=signal(0);
  apiOnline=signal(false); toast=signal(''); saved=signal(false); help=signal(false);
  private toastTimer?: ReturnType<typeof setTimeout>;
  car=computed(()=>this.catalog().models.find(m=>m.id===this.model())!);
  modelWatermark=computed(()=>({m4:'THE M4',m2:'THE M2',e46:'THE E46',e92:'THE E92',e36:'THE E36'} as Record<string,string>)[this.model()]);
  modelEdition=computed(()=>({m4:'M Performance',m2:'G87',e46:'E46 Berlina',e92:'E92 · Stance',e36:'E36 · Street'} as Record<string,string>)[this.model()]);
  heritage=computed(()=>['e46','e36'].includes(this.model()));
  priceNote=computed(()=>({e46:'Berlina E46 · Precio simulado',e92:'Preparación stance · Precio simulado',e36:'Preparación Street · Precio simulado'} as Record<string,string>)[this.model()]??'Precio orientativo · Configuración de demostración');
  selectedPaint=computed(()=>this.catalog().paints.find(p=>p.id===this.paint())!);
  selectedWheels=computed(()=>this.catalog().wheels.find(p=>p.id===this.wheels())!);
  selectedInterior=computed(()=>this.catalog().interiors.find(p=>p.id===this.interior())!);
  total=computed(()=>this.car().price+this.selectedPaint().price+this.selectedWheels().price+this.selectedInterior().price);
  partTitle=computed(()=>({paint:'Carrocería y pintura',wheels:'Llantas y frenos',interior:'Habitáculo y tapicería'}[this.activePart()]));
  constructor() {
    if(this.checkoutToken!==null)return;
    const query=new URLSearchParams(location.search);
    const shared=query.has('model');
    let selection: Record<string,string>={};
    try { selection=shared?Object.fromEntries(query):JSON.parse(localStorage.getItem('atelier.configuration')||'{}'); } catch { /* Storage may be unavailable. */ }
    this.restore(selection);
    this.http.get<Catalog>('/api/catalog').pipe(timeout(4000)).subscribe({next:data=>{this.catalog.set(data);if(!data.models.some(m=>m.id===this.model()))this.model.set(data.models[0].id);this.apiOnline.set(true);},error:()=>this.apiOnline.set(false)});
  }
  private restore(s:Record<string,string>) {
    if(!s || typeof s!=='object')return;
    const c=this.catalog();
    if(c.models.some(x=>x.id===s['model']))this.model.set(s['model']);
    if(c.paints.some(x=>x.id===s['paint']))this.paint.set(s['paint']);
    if(c.wheels.some(x=>x.id===s['wheels']))this.wheels.set(s['wheels']);
    if(c.interiors.some(x=>x.id===s['interior']))this.interior.set(s['interior']);
  }
  selectPart(part:string) { this.activePart.set(part); if(part!=='interior' && this.view()==='interior') this.view.set('exterior'); }
  choose(type:string,id:string) {
    if(type==='paint')this.paint.set(id);
    if(type==='wheels')this.wheels.set(id);
    if(type==='interior')this.interior.set(id);
    this.activePart.set(type);
    this.saved.set(false);
  }
  chooseModel(id:string) { if(!this.catalog().models.some(m=>m.id===id))return;this.model.set(id);this.saved.set(false);this.reset(); document.getElementById('configurador')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}); }
  setView(view:string) { this.view.set(view); if(view==='interior'){this.exploded.set(false);this.autoRotate.set(false);this.activePart.set('interior');} }
  toggleExploded() { this.view.set('exterior'); this.exploded.update(v=>!v); }
  reset() { this.view.set('exterior');this.exploded.set(false);this.autoRotate.set(false);this.resetKey.update(v=>v+1); }
  navigate(section:string,event:MouseEvent) {
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;
    event.preventDefault();
    const url=new URL(location.href);url.hash=section;history.pushState(null,'',url);
    const behavior=window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
    if(section)document.getElementById(section)?.scrollIntoView({behavior});else window.scrollTo({top:0,behavior});
  }
  openSummary() {
    ++this.checkoutRequestId;this.buying.set(false);clearTimeout(this.checkoutPoll);this.checkout.set(null);this.qrImage.set('');this.checkoutLink.set('');this.purchaseError.set('');
    this.summary.nativeElement.showModal();
  }
  closeSummary() { ++this.checkoutRequestId;this.buying.set(false);clearTimeout(this.checkoutPoll);this.summary.nativeElement.close(); }
  backToSummary() { clearTimeout(this.checkoutPoll);this.checkout.set(null);this.qrImage.set('');this.purchaseError.set(''); }
  buy() {
    if(this.buying())return;
    this.buying.set(true);this.purchaseError.set('');const selection=this.selection();const requestId=++this.checkoutRequestId;
    this.http.post<CheckoutView>('/api/checkouts',selection).pipe(timeout(10000)).subscribe({
      next:async view=>{
        if(this.destroyed || requestId!==this.checkoutRequestId)return;
        const url=new URL(view.checkoutUrl,location.origin).toString();this.checkoutLink.set(url);this.checkout.set(view);
        this.persistLocal(selection);this.saved.set(true);this.apiOnline.set(true);
        try {const image=await toDataURL(url,{width:288,margin:4,errorCorrectionLevel:'M',color:{dark:'#111820',light:'#ffffff'}});if(this.destroyed || requestId!==this.checkoutRequestId)return;this.qrImage.set(image);}
        catch {if(this.destroyed || requestId!==this.checkoutRequestId)return;this.purchaseError.set('No se ha podido generar el QR. Puedes continuar con el enlace.');}
        this.buying.set(false);this.pollCheckout();
      },
      error:()=>{if(requestId!==this.checkoutRequestId)return;this.buying.set(false);this.purchaseError.set('No se ha podido iniciar la compra. Comprueba la conexión con el servidor e inténtalo de nuevo.');}
    });
  }
  private pollCheckout() {
    clearTimeout(this.checkoutPoll);const current=this.checkout();
    if(this.destroyed || !current || !this.summary.nativeElement.open || current.state==='COMPLETED' && current.emailStatus!=='QUEUED')return;
    this.checkoutPoll=setTimeout(()=>{
      this.http.get<CheckoutView>('/api/checkouts/'+current.id).pipe(timeout(7000)).subscribe({
        next:view=>{if(this.destroyed || this.checkout()?.id!==current.id)return;this.checkout.set(view);this.pollCheckout();},
        error:response=>{if(response.status===410){this.purchaseError.set('El QR ha caducado. Vuelve al resumen para generar uno nuevo.');return;}this.pollCheckout();}
      });
    },3000);
  }
  ngOnDestroy() { this.destroyed=true;clearTimeout(this.checkoutPoll);clearTimeout(this.toastTimer); }
  selection() { return {model:this.model(),paint:this.paint(),wheels:this.wheels(),interior:this.interior()}; }
  notify(text:string) { clearTimeout(this.toastTimer);this.toast.set(text);this.toastTimer=setTimeout(()=>this.toast.set(''),6500); }
  private persistLocal(selection:Record<string,string>):boolean { try {localStorage.setItem('atelier.configuration',JSON.stringify(selection));return true;}catch{return false;} }
  async share() {
    const url=new URL(location.href);url.search=new URLSearchParams(this.selection()).toString();url.hash='configurador';
    try {await navigator.clipboard.writeText(url.toString());this.notify('Enlace de tu configuración copiado.');}
    catch {this.notify('No se pudo copiar. Descarga la configuración desde el resumen.');}
  }
  download() {
    const blob=new Blob([JSON.stringify({ ...this.selection(),modelName:this.car().name,estimatedTotal:this.total(),currency:'EUR',demonstration:true },null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob), link=document.createElement('a');link.href=url;link.download='mi-bmw-configuracion.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  optionPrice(option:Option) { return option.price===0?'Incluido':'+ '+new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(option.price); }
  swatchInk(hex='#000000') {
    const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
      .map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
    return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722>.179?'#15191e':'#ffffff';
  }
}
